# WikiCool — Technical Debt & Deferred Items

Items below were identified during a full code review but are deferred because
they require significant effort, design decisions, or are blocked on external
factors. Each entry includes a resolution path and rough effort estimate.

---

## Security

### [MEDIUM] OAuth token briefly in URL fragment
The OAuth callback delivers the token in `#access_token=<token>`.
`window.history.replaceState` clears it immediately
([AuthCallbackPage.tsx:33–35](../src/pages/AuthCallbackPage.tsx)), but browser
extensions and analytics scripts that run before the `useEffect` fires can still
read `window.location.hash`.

**Resolution:** Implement PKCE + use the Worker's existing `/exchange` endpoint
([oauth-worker/src/index.ts](../oauth-worker/src/index.ts)) to deliver the token
via a short-lived `HttpOnly` server-set cookie instead of the URL fragment. The
SPA reads the cookie on return, then the cookie is cleared. Requires changes to
both the Worker and `AuthCallbackPage`.

**Effort:** ~2–3 days. Revisit if the app moves beyond homelab use or if a
security audit is required.

---

### [MEDIUM] GitHub OAuth classic `repo` scope is overly broad
Classic GitHub OAuth cannot scope to a single repository — `repo` grants
read/write access to **all** private repos on the authenticated account.
Fine-grained PATs (the PAT login path) are the proper alternative and are
already recommended in the UI.

**Resolution:** Monitor [GitHub's OAuth App roadmap](https://github.com/orgs/community/discussions)
for fine-grained OAuth app scope support. No code change is possible until
GitHub ships per-repo OAuth scoping. Until then, encourage users to prefer the
PAT path.

**Effort:** Blocked on GitHub. No action today.

---

## Testing

### [LOW] No test infrastructure
The project has zero tests and no test framework configured.

**Recommended stack:**
- **Unit / integration:** [Vitest](https://vitest.dev/) + React Testing Library + MSW (mock Service Worker for GitHub API calls)
- **Worker tests:** Vitest + [Miniflare](https://miniflare.dev/) for the Cloudflare Worker
- **E2E:** [Playwright](https://playwright.dev/) smoke tests covering login → page load → edit → save flows

**Priority targets:**
| File | What to test |
|---|---|
| `src/lib/auth.ts` | `getToken`, `setToken`, `clearToken`, `hasToken` |
| `src/lib/backlinks.ts` | `buildBacklinkIndex` with fixture pages |
| `src/lib/markdown.ts` | `parsePage` frontmatter and wikilink extraction |
| `oauth-worker/src/index.ts` | `/authorize`, `/callback` state validation, `/webhook` HMAC check, connection cap |

**Effort:** 2–3 days to set up infrastructure and reach ~60% coverage on the pure utility modules.

---

## Accessibility / UI

### [LOW] Graph legend color contrast
Some `TYPE_COLORS` values in
[GraphView.tsx:23–32](../src/components/GraphView.tsx) may fail WCAG AA
contrast requirements against the card background:

| Type | Color | Risk |
|---|---|---|
| `product` | `#8b6914` | Likely fails on light bg |
| `unknown` | `var(--ink-faint)` | Likely fails everywhere |

**Resolution:** Run [axe DevTools](https://www.deque.com/axe/) or Colour Contrast
Analyser against each type in both light and dark themes. Update color values to
meet 3:1 minimum contrast for non-text UI elements (WCAG 1.4.11). The legend
dots are decorative indicators, so 3:1 is the applicable threshold.

**Effort:** 1–2 hours once the theme's final color palette is settled.
