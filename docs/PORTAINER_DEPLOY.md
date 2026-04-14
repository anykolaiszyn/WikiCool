# Portainer Deployment Guide

Deploy VCC Wiki from your GitHub repository using Portainer's Git stack integration. Every push to `main` automatically builds a new Docker image and redeploys the stack — no SSH or shell access needed after initial setup.

---

## How it works

```
Push to main
     │
     ▼
GitHub Actions (.github/workflows/docker.yml)
  ├── Builds Docker image (linux/amd64 + linux/arm64)
  ├── Bakes in VITE_* config from repo secrets/variables
  ├── Pushes to ghcr.io/anykolaiszyn/wikicool:latest
  └── POSTs to Portainer webhook → redeploy triggered
                                         │
                                         ▼
                               Portainer pulls :latest
                               Recreates vcc-wiki container
                               Wiki is live with new build
```

All `VITE_*` configuration (repo coordinates, token, OAuth/webhook URLs) is baked into the image during CI. The Portainer stack file (`docker-compose.portainer.yml`) is intentionally simple — it only specifies the image tag, port, and tmpfs mounts.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| Portainer CE ≥ 2.19 or BE | Community Edition is free and sufficient |
| Docker Engine ≥ 24 on the host | `docker --version` to check |
| GitHub repository access | You must be able to push to `main` |
| GitHub Container Registry | Enabled by default for all GitHub accounts |

---

## Step 1 — Set GitHub Actions secrets and variables

Go to your GitHub repository → **Settings → Secrets and variables → Actions**.

### Secrets tab (sensitive values — encrypted, never visible after save)

| Secret name | Value | Required |
|---|---|---|
| `VITE_GITHUB_OWNER` | Your GitHub username or org (e.g. `anykolaiszyn`) | Yes |
| `VITE_GITHUB_REPO` | Content repo name (e.g. `vcc-wiki-content`) | Yes |
| `VITE_GITHUB_TOKEN` | Fine-grained PAT for the content repo (`Contents: Read+Write`, `Metadata: Read-only`) | No — leave blank to use runtime login prompt |
| `PORTAINER_WEBHOOK_URL` | Portainer stack webhook URL (set in Step 5) | No — add after initial deploy |

### Variables tab (non-sensitive values — visible in logs)

| Variable name | Value | Default |
|---|---|---|
| `VITE_GITHUB_BRANCH` | Branch of the content repo | `main` |
| `VITE_CONTENT_PATH` | Content root folder inside the content repo | `content` |
| `VITE_OAUTH_BASE` | Cloudflare Worker URL for OAuth (e.g. `https://vcc-wiki-oauth.your-subdomain.workers.dev`) | blank — PAT-only mode |
| `VITE_WEBHOOK_BASE` | Cloudflare Worker URL for SSE live-reload | blank — disabled |

> **Why secrets vs variables?**
> Secrets are encrypted and masked in logs. Variables are plain-text and visible in workflow run logs. Use secrets for anything you would not want in a log file. `VITE_GITHUB_OWNER` and `VITE_GITHUB_REPO` are technically public in the compiled JS, but using secrets keeps them out of workflow logs.

---

## Step 2 — Make the ghcr.io package public (recommended)

By default, newly pushed packages on ghcr.io are **private**. Portainer must authenticate to pull private images. Making the package public avoids the need to configure a registry credential in Portainer.

> Skip this step if you prefer to keep the image private and are comfortable configuring a registry credential in Portainer (see Appendix A).

1. Go to your GitHub profile → **Packages**.
2. Find `wikicool` (it will appear after the first successful workflow run in Step 3).
3. Click the package → **Package settings** → scroll to **Danger Zone** → **Change visibility** → **Public**.

---

## Step 3 — Trigger the first image build

Push any commit to `main` (or use **Actions → Build and publish Docker image → Run workflow**) to trigger the first build. Watch the Actions tab — the job typically takes 3–5 minutes.

When the job completes successfully:
- The image is available at `ghcr.io/anykolaiszyn/wikicool:latest`
- A SHA-tagged version is also available: `ghcr.io/anykolaiszyn/wikicool:sha-<7chars>`

---

## Step 4 — Create the Portainer stack

1. Open Portainer → **Stacks** → **Add stack**.
2. Give it a name: `vcc-wiki`.
3. Select **Repository** as the build method.

Fill in the form:

| Field | Value |
|---|---|
| Repository URL | `https://github.com/anykolaiszyn/WikiCool` |
| Repository reference | `refs/heads/main` |
| Compose path | `docker-compose.portainer.yml` |
| Authentication | Off (public repo) |

Under **Automatic updates**:
- Enable **Polling** if you want Portainer to check for changes on a schedule (every 5 min is fine as a fallback).
- Leave it off if you prefer push-based updates via webhook only (Step 5).

4. Click **Deploy the stack**.

Portainer will pull `ghcr.io/anykolaiszyn/wikicool:latest` and start the container on port `8080`.

---

## Step 5 — Set up the Portainer webhook for automatic redeploy

After the stack is deployed, Portainer can expose a webhook URL that, when POSTed to, pulls the latest image and recreates the container.

1. In Portainer → **Stacks** → click `vcc-wiki`.
2. Scroll to **Stack webhook**.
3. Click **Enable webhook** and copy the generated URL. It looks like:
   ```
   https://portainer.example.com/api/stacks/webhooks/<uuid>
   ```
4. Go back to GitHub → **Settings → Secrets and variables → Actions → Secrets**.
5. Add a new secret:
   - **Name**: `PORTAINER_WEBHOOK_URL`
   - **Value**: the webhook URL you just copied

From now on, every successful image push from GitHub Actions will automatically trigger a redeploy in Portainer. The full cycle (push → build → redeploy) takes about 4–6 minutes.

---

## Step 6 — Verify the deployment

1. In Portainer → **Containers**, find `vcc-wiki`. Status should be **running**.
2. Click the container → **Logs** to see Caddy's startup output:
   ```
   {"level":"info","ts":…,"msg":"serving initial configuration"}
   {"level":"info","ts":…,"msg":"serving new configuration"}
   ```
3. Open `http://<your-homelab-ip>:8080` in a browser. The wiki login screen should appear.
4. If Cloudflare Tunnel is configured, the public URL will work too.

---

## Day-to-day workflow

### Updating the app code

```bash
# Edit code locally
git add . && git commit -m "Your change"
git push origin main
# GitHub Actions builds → pushes image → Portainer redeploys automatically
```

### Rotating the GitHub PAT

1. Generate a new PAT in GitHub → Settings → Developer settings.
2. In GitHub Actions secrets, update `VITE_GITHUB_TOKEN` with the new value.
3. Trigger a manual rebuild: **Actions → Build and publish Docker image → Run workflow**.
4. Portainer redeploys automatically when the new image is pushed.

### Pinning to a specific build

To prevent automatic updates from breaking a stable deployment, pin the image tag to a specific SHA in `docker-compose.portainer.yml`:

```yaml
services:
  vcc-wiki:
    image: ghcr.io/anykolaiszyn/wikicool:sha-abc1234
```

Commit and push this change. Portainer will use the pinned tag from then on, and only update when you manually change the tag back to `latest` or a newer SHA.

---

## Troubleshooting

### Portainer shows "image not found" on deploy

The image may still be private. See Step 2, or configure a registry credential in Portainer (see Appendix A).

### GitHub Actions build fails with "VITE_GITHUB_OWNER is empty"

The secret is not set or has a typo. Go to Settings → Secrets and variables → Actions → Secrets and verify the name exactly matches the table in Step 1. Secret names are case-sensitive.

### Container starts but wiki shows a blank page

The Vite build succeeded but a `VITE_GITHUB_OWNER` or `VITE_GITHUB_REPO` value was wrong at build time. Open browser DevTools → Console — you should see a "repository not found" or "401 Unauthorized" error from the GitHub API. Correct the secret value and trigger a rebuild.

### Portainer webhook returns 4xx

The webhook URL may have changed (Portainer generates a new URL when the stack is deleted and recreated). Copy the new URL from Portainer → Stacks → `vcc-wiki` → Stack webhook, and update the `PORTAINER_WEBHOOK_URL` secret.

### Build is slow (> 10 minutes)

The first build after a cache miss (new runner, deleted cache, or `node_modules` layer changed) can take 8–10 minutes for the multi-platform build. Subsequent builds are typically 2–3 minutes because the GitHub Actions layer cache (`cache-from: type=gha`) keeps the `npm ci` layer warm.

### Port 8080 is already in use

Change the host port in `docker-compose.portainer.yml`:

```yaml
ports:
  - "9090:8080"   # serve on host port 9090
```

Commit and push — Portainer will redeploy with the new port mapping.

---

## Appendix A — Private ghcr.io image

If you prefer to keep the image private, configure a registry credential in Portainer:

1. Portainer → **Registries** → **Add registry** → **Custom registry**.
2. Fill in:
   - **Name**: GitHub Container Registry
   - **Registry URL**: `ghcr.io`
   - **Username**: your GitHub username
   - **Password**: a GitHub personal access token with `read:packages` scope
3. In `docker-compose.portainer.yml`, no change is needed — Portainer will use the credential automatically when pulling from `ghcr.io`.

---

## Appendix B — Portainer Edge Agent (remote homelab)

If your Portainer server is on a different network from your Docker host (e.g. Portainer Cloud managing a homelab node), use the **Edge Agent** instead of a direct connection. The stack deployment and webhook flows are identical — only the initial agent registration differs. See the Portainer Edge Agent documentation for setup.

---

## Appendix C — Multi-architecture notes

The workflow builds `linux/amd64` and `linux/arm64` in a single manifest. Portainer will automatically pull the correct architecture for your host:

- Intel/AMD homelab server → `linux/amd64`
- Raspberry Pi 4/5, Apple Silicon VM → `linux/arm64`
- Raspberry Pi 3 or earlier → not supported (armv7; not in the build matrix)

To add `linux/arm/v7` support, add it to the `platforms` line in `.github/workflows/docker.yml`.
