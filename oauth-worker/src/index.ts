/**
 * VCC Wiki — Cloudflare Worker
 *
 * OAuth routes
 * ────────────
 *  GET  /authorize  →  redirect to GitHub OAuth authorization page
 *  GET  /callback   →  receive code from GitHub, exchange for token,
 *                      redirect to app with token in URL fragment
 *  POST /exchange   →  server-to-server token exchange (returns JSON)
 *
 * Live-reload routes (backed by BroadcastRoom Durable Object)
 * ────────────────────────────────────────────────────────────
 *  GET  /events     →  SSE stream; receives "refresh" events when the repo
 *                      content changes
 *  POST /webhook    →  GitHub push-event webhook; verifies HMAC-SHA256
 *                      signature and broadcasts a "refresh" event to all
 *                      connected SSE clients
 *
 * Required Worker secrets (set via `wrangler secret put`):
 *   GITHUB_CLIENT_ID      — OAuth App client ID
 *   GITHUB_CLIENT_SECRET  — OAuth App client secret
 *   APP_ORIGIN            — e.g. https://wiki.example.com (no trailing slash)
 *   WEBHOOK_SECRET        — secret string chosen when registering the GitHub
 *                           webhook; used to verify X-Hub-Signature-256
 */

export interface Env {
  GITHUB_CLIENT_ID: string
  GITHUB_CLIENT_SECRET: string
  /** App origin for redirects and CORS, e.g. https://wiki.example.com */
  APP_ORIGIN: string
  /**
   * Shared secret between this Worker and the GitHub webhook.
   * Set at github.com → repo → Settings → Webhooks → Secret.
   */
  WEBHOOK_SECRET: string
  /** Durable Object namespace binding (see wrangler.toml). */
  BROADCAST_ROOM: DurableObjectNamespace
}

// ── BroadcastRoom Durable Object ─────────────────────────────────────────────
//
// A single long-lived instance (keyed by the name "main") that:
//   - Holds one TransformStream writer per connected SSE client.
//   - Fans out broadcast messages to all connected clients.
//   - Cleans up dead writers automatically on write failure or client disconnect.
//
// The DO stays alive as long as at least one SSE connection is open.
// After all clients disconnect the DO may be evicted; the next webhook simply
// finds no connections and does nothing. Clients reconnect via EventSource's
// automatic reconnect + the exponential-backoff logic in useLiveReload.

const enc = new TextEncoder()

export class BroadcastRoom {
  private static readonly MAX_CONNECTIONS = 500
  private readonly connections = new Map<string, WritableStreamDefaultWriter<Uint8Array>>()

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    // ── GET /subscribe ──────────────────────────────────────────────────────
    // Creates a new TransformStream for this client and returns the readable
    // end as a text/event-stream response.
    if (url.pathname === '/subscribe') {
      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>()
      const writer = writable.getWriter()
      const id = crypto.randomUUID()

      if (this.connections.size >= BroadcastRoom.MAX_CONNECTIONS) {
        await writer.close()
        return new Response('Too Many Connections', { status: 503 })
      }

      this.connections.set(id, writer)

      // Send a comment as a keep-alive / "you're connected" signal.
      // EventSource ignores lines starting with ':'.
      writer.write(enc.encode(': connected\n\n')).catch(() => {/* stream already closed */})

      // When the client disconnects (closes the tab, navigates away, etc.)
      // the Workers runtime aborts the request signal, giving us a clean hook
      // to remove the writer from the map.
      request.signal.addEventListener('abort', () => {
        this.connections.delete(id)
        writer.close().catch(() => {/* already closed */})
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no', // prevent nginx/Caddy from buffering the stream
          'Access-Control-Allow-Origin': '*',
        },
      })
    }

    // ── POST /broadcast ─────────────────────────────────────────────────────
    // Internal endpoint: the Worker's /webhook handler calls this after
    // verifying the GitHub signature. Not exposed to the public internet
    // (the Worker only calls it internally via the DO stub).
    if (url.pathname === '/broadcast') {
      const { event, data } = (await request.json()) as { event: string; data: string }
      const msg = enc.encode(`event: ${event}\ndata: ${data}\n\n`)

      // Write to all connections, collecting IDs of any that failed.
      const writeResults = await Promise.allSettled(
        Array.from(this.connections.entries()).map(([id, writer]) =>
          writer.write(msg).then(() => null as string | null).catch(() => id),
        ),
      )

      const dead = writeResults
        .filter((r): r is PromiseFulfilledResult<string> =>
          r.status === 'fulfilled' && r.value !== null,
        )
        .map((r) => r.value)

      dead.forEach((id) => this.connections.delete(id))

      return new Response(
        JSON.stringify({
          notified: this.connections.size + dead.length, // attempted before deletion
          dead: dead.length,
        }),
        { headers: { 'Content-Type': 'application/json' } },
      )
    }

    return new Response('Not found', { status: 404 })
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

function generateState(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
): Promise<string> {
  const resp = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'vcc-wiki-oauth-worker/1.0',
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  })

  if (!resp.ok) {
    throw new Error(`GitHub token endpoint returned ${resp.status}`)
  }

  const data = (await resp.json()) as {
    access_token?: string
    error?: string
    error_description?: string
  }

  if (data.error || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? 'Token exchange failed')
  }

  return data.access_token
}

// ── HMAC-SHA256 webhook signature verification ────────────────────────────────

function hexToUint8Array(hex: string): Uint8Array {
  const arr = new Uint8Array(hex.length / 2)
  for (let i = 0; i < arr.length; i++) {
    arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return arr
}

/**
 * Verify the X-Hub-Signature-256 header from GitHub.
 *
 * Uses `crypto.subtle.verify` for a constant-time HMAC comparison —
 * no timing-oracle vulnerability.
 */
async function verifyWebhookSignature(
  body: ArrayBuffer,
  secret: string,
  sigHeader: string,
): Promise<boolean> {
  if (!sigHeader.startsWith('sha256=')) return false
  const sigHex = sigHeader.slice(7)
  if (sigHex.length % 2 !== 0) return false

  let sigBytes: Uint8Array
  try {
    sigBytes = hexToUint8Array(sigHex)
  } catch {
    return false
  }

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )

  return crypto.subtle.verify('HMAC', key, sigBytes, body)
}

// ── main fetch handler ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(env.APP_ORIGIN),
          // SSE endpoint also needs CORS preflight support
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        },
      })
    }

    // ── GET /events ─────────────────────────────────────────────────────────
    // Subscribe to the SSE broadcast stream. Forwarded to the BroadcastRoom DO.
    if (method === 'GET' && url.pathname === '/events') {
      const roomId = env.BROADCAST_ROOM.idFromName('main')
      const room = env.BROADCAST_ROOM.get(roomId)
      return room.fetch(new Request(`${url.origin}/subscribe`, request))
    }

    // ── POST /webhook ───────────────────────────────────────────────────────
    // Receive a GitHub push event, verify the signature, and broadcast a
    // "refresh" event to all connected SSE clients.
    if (method === 'POST' && url.pathname === '/webhook') {
      // Reject unconfigured workers before consuming any body — avoids
      // buffering an arbitrarily large payload for unauthenticated callers.
      if (!env.WEBHOOK_SECRET) {
        return json({ error: 'WEBHOOK_SECRET not configured' }, 501)
      }

      // Must read the body as ArrayBuffer before anything else — once consumed
      // as JSON or text it can't be re-read for signature verification.
      const bodyBuffer = await request.arrayBuffer()

      const sigHeader = request.headers.get('X-Hub-Signature-256') ?? ''
      const valid = await verifyWebhookSignature(bodyBuffer, env.WEBHOOK_SECRET, sigHeader)

      if (!valid) {
        return json({ error: 'Invalid signature' }, 401)
      }

      // Parse enough of the payload to build a useful broadcast message.
      let pusher = 'unknown'
      let ref = ''
      try {
        const payload = JSON.parse(new TextDecoder().decode(bodyBuffer)) as {
          pusher?: { name?: string }
          ref?: string
        }
        pusher = payload.pusher?.name ?? 'unknown'
        ref = payload.ref ?? ''
      } catch {
        // Non-JSON body (shouldn't happen for push events, but be tolerant).
      }

      // Fan out to all SSE clients via the Durable Object.
      const roomId = env.BROADCAST_ROOM.idFromName('main')
      const room = env.BROADCAST_ROOM.get(roomId)
      await room.fetch(
        new Request(`${url.origin}/broadcast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'refresh',
            data: JSON.stringify({ pusher, ref, ts: Date.now() }),
          }),
        }),
      )

      return json({ ok: true })
    }

    // ── GET /authorize ──────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/authorize') {
      const state = generateState()
      const authUrl = new URL('https://github.com/login/oauth/authorize')
      authUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID)
      authUrl.searchParams.set('scope', 'repo')
      authUrl.searchParams.set('state', state)

      return new Response(null, {
        status: 302,
        headers: {
          Location: authUrl.toString(),
          'Set-Cookie': [
            `oauth_state=${state}`,
            'HttpOnly',
            'Secure',
            'SameSite=Lax',
            'Path=/',
            'Max-Age=600',
          ].join('; '),
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── GET /callback ───────────────────────────────────────────────────────
    if (method === 'GET' && url.pathname === '/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')

      const cookieHeader = request.headers.get('Cookie') ?? ''
      const cookieState = cookieHeader
        .split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('oauth_state='))
        ?.slice('oauth_state='.length)

      if (!code) return errorRedirect(env.APP_ORIGIN, 'oauth_missing_code')
      if (!state || !cookieState || state !== cookieState) {
        return errorRedirect(env.APP_ORIGIN, 'oauth_state_mismatch')
      }

      let accessToken: string
      try {
        accessToken = await exchangeCode(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, code)
      } catch (err) {
        console.error('Token exchange failed:', err instanceof Error ? err.message : String(err))
        return errorRedirect(env.APP_ORIGIN, 'oauth_exchange_failed')
      }

      const dest = new URL('/auth/callback', env.APP_ORIGIN)
      dest.hash = `access_token=${encodeURIComponent(accessToken)}`

      return new Response(null, {
        status: 302,
        headers: {
          Location: dest.toString(),
          'Set-Cookie': 'oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0',
          'Cache-Control': 'no-store',
        },
      })
    }

    // ── POST /exchange ──────────────────────────────────────────────────────
    if (method === 'POST' && url.pathname === '/exchange') {
      let code: string | undefined
      try {
        const body = (await request.json()) as { code?: string }
        code = body.code
      } catch {
        return json({ error: 'Invalid JSON body' }, 400)
      }

      if (!code || typeof code !== 'string') {
        return json({ error: 'Missing required field: code' }, 400)
      }

      let accessToken: string
      try {
        accessToken = await exchangeCode(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET, code)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Token exchange failed'
        return new Response(JSON.stringify({ error: message }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            ...corsHeaders(env.APP_ORIGIN),
          },
        })
      }

      return new Response(JSON.stringify({ access_token: accessToken }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          ...corsHeaders(env.APP_ORIGIN),
        },
      })
    }

    // ── 404 ─────────────────────────────────────────────────────────────────
    return json({ error: 'Not found' }, 404)
  },
}

// ── helpers ───────────────────────────────────────────────────────────────────

function errorRedirect(appOrigin: string, reason: string): Response {
  const dest = new URL('/auth/callback', appOrigin)
  dest.hash = `error=${encodeURIComponent(reason)}`
  return new Response(null, {
    status: 302,
    headers: { Location: dest.toString(), 'Cache-Control': 'no-store' },
  })
}
