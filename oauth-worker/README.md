# VCC Wiki — OAuth Worker

A minimal Cloudflare Worker that handles the GitHub OAuth token exchange so
the `client_secret` never touches the browser.

---

## How it works

```
Browser                  Worker                   GitHub
──────                   ──────                   ──────
Click "Sign in"
  → GET /authorize  ──►  302 → github.com/login/oauth/authorize
                          (sets oauth_state cookie)

                         GitHub login & consent ─► 302 → Worker /callback?code=…&state=…
                          Worker verifies state cookie
                          Worker POSTs code + secret to GitHub
                                                  ◄─ { access_token }
  ◄── 302 → app /auth/callback#access_token=…
  App reads fragment, stores token, redirects to wiki home
```

The access token appears only in the URL fragment (`#…`), which is never sent
to any server and is not recorded in access logs.

---

## 1 · Register a GitHub OAuth App

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name**: VCC Wiki (or whatever you like)
   - **Homepage URL**: your deployed app URL, e.g. `https://wiki.example.com`
   - **Authorization callback URL**: `https://<your-worker>.workers.dev/callback`
     (update this after deploying — see step 3)
3. Click **Register application**.
4. Note the **Client ID** (public) and generate a **Client secret** (keep secret).

---

## 2 · Install dependencies and configure

```bash
cd oauth-worker
npm install
```

Edit `wrangler.toml` if you want a custom route:
```toml
[[routes]]
pattern   = "oauth.example.com/*"
zone_name = "example.com"
```

Otherwise the Worker will be available at the default
`https://vcc-wiki-oauth.<your-subdomain>.workers.dev`.

---

## 3 · Set Worker secrets

Secrets are never stored in `wrangler.toml` or committed to source control.
Set them with Wrangler's interactive prompt:

```bash
# GitHub OAuth App client ID (public — but kept as a secret for convenience)
npx wrangler secret put GITHUB_CLIENT_ID

# GitHub OAuth App client secret (must stay private)
npx wrangler secret put GITHUB_CLIENT_SECRET

# Your wiki app's origin, e.g. https://wiki.example.com
# Used to build the redirect URL and CORS headers.
npx wrangler secret put APP_ORIGIN

# Webhook signing secret — same value you set in GitHub → repo → Settings → Webhooks → Secret
# Required for POST /webhook to accept push events. If unset, webhook deliveries return 501.
# Generate with: openssl rand -hex 32
npx wrangler secret put WEBHOOK_SECRET
```

Each command will prompt you to paste the value. Wrangler encrypts it before
uploading — it is never visible in plaintext again.

---

## 4 · Deploy

```bash
npx wrangler deploy
```

Note the Worker URL printed on success (e.g.
`https://vcc-wiki-oauth.your-subdomain.workers.dev`).

---

## 5 · Update the GitHub OAuth App callback URL

Go back to your OAuth App settings on GitHub and update the
**Authorization callback URL** to:

```
https://vcc-wiki-oauth.your-subdomain.workers.dev/callback
```

---

## 6 · Configure the wiki app

In your wiki's `.env.local`, set:

```env
VITE_OAUTH_BASE=https://vcc-wiki-oauth.your-subdomain.workers.dev
```

Rebuild and redeploy the wiki app. The login screen will now show a
**Sign in with GitHub** button in addition to the PAT input.

---

## Local development

```bash
# Start the Worker locally (binds to http://localhost:8787 by default)
npx wrangler dev
```

For local testing you'll need to temporarily set secrets as environment
variables (Wrangler dev reads from `.dev.vars`):

```
# oauth-worker/.dev.vars  (git-ignored — never commit this file)
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
APP_ORIGIN=http://localhost:5173
```

Update the GitHub OAuth App's callback URL to
`http://localhost:8787/callback` while testing locally, then restore it
before deploying to production.

---

## Endpoints

| Method | Path        | Description |
|--------|-------------|-------------|
| `GET`  | `/authorize` | Redirects to GitHub's OAuth authorization page. Sets `oauth_state` cookie for CSRF protection. |
| `GET`  | `/callback`  | Receives `code` and `state` from GitHub. Verifies state cookie, exchanges code for token, redirects to app with token in URL fragment. |
| `POST` | `/exchange`  | Accepts `{ code }` JSON body, returns `{ access_token }`. For server-to-server use. Requires same `APP_ORIGIN` for CORS. |

---

## Live-reload via GitHub webhook

The same Worker handles the GitHub push webhook and fans out a Server-Sent
Events (SSE) stream to all connected wiki tabs. Edits committed directly to
the content repo (via CLI, mobile GitHub app, or Claude Code) appear in the
wiki within a few seconds.

### How it works

```
GitHub push → POST /webhook (HMAC verified) → BroadcastRoom DO
                                                     │
                        ┌────────────────────────────┤
                        ▼                            ▼
               GET /events (tab 1)          GET /events (tab 2)
               EventSource "refresh"        EventSource "refresh"
                        │                            │
                 store.reload()              store.reload()
```

The `BroadcastRoom` Durable Object holds one `TransformStream` writer per
connected tab. Because it's a single DO instance (named `"main"`), all Worker
instances route webhooks to the same broadcaster regardless of which edge node
handles the request.

### 7 · Add the WEBHOOK_SECRET

Generate a random secret (e.g. `openssl rand -hex 32`) and store it:

```bash
npx wrangler secret put WEBHOOK_SECRET
```

### 8 · Register the GitHub webhook

1. Go to your **content repo** → Settings → Webhooks → Add webhook.
2. Fill in:
   - **Payload URL**: `https://vcc-wiki-oauth.<subdomain>.workers.dev/webhook`
   - **Content type**: `application/json`
   - **Secret**: the same value you stored as `WEBHOOK_SECRET`
   - **Which events**: select **Just the push event**
3. Click **Add webhook**. GitHub will send a ping; the Worker returns 200.

### 9 · Configure the wiki app

```env
# In .env.local — same base URL as VITE_OAUTH_BASE if same Worker deployment
VITE_WEBHOOK_BASE=https://vcc-wiki-oauth.<subdomain>.workers.dev
```

Rebuild and redeploy the wiki app. Open two tabs — commit something to the
content repo and watch the second tab reload automatically within ~3 seconds.

### Reconnect behaviour

The `useLiveReload` hook in `src/lib/livereload.ts` opens the EventSource and
reconnects with exponential backoff (1 s → 2 s → … → 30 s cap) if the
connection drops (Worker restart, DO eviction, network blip). No user action
required.

---

## Security notes

- The `client_secret` is stored as a Worker secret and never leaves the Worker.
- State parameter CSRF protection: the Worker sets a `HttpOnly; Secure; SameSite=Lax`
  cookie on `/authorize` and verifies it matches the `state` query param on `/callback`.
- The access token is passed to the app in the URL fragment (`#access_token=…`),
  not the query string, so it is not logged by servers or proxies.
- The fragment is immediately cleared from `window.location` by `AuthCallbackPage`
  after being read, so it won't appear if the user copies the URL.
- Token scope: the Worker requests `repo` scope. If your content repo is
  private this is required. You can narrow it to `contents:write` if using
  a GitHub App instead.
- Webhook signature verification uses `crypto.subtle.verify` (constant-time
  HMAC comparison) — no timing oracle.
- The SSE `/events` endpoint carries no sensitive data — it only sends
  `event: refresh` with a pusher name and timestamp. No authentication is
  required to subscribe; the worst a rogue subscriber can do is receive
  "someone pushed" notifications.
