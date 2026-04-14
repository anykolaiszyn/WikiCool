# Homelab Deployment Guide

This guide walks through running VCC Wiki on a homelab machine and exposing it privately via a Cloudflare Tunnel with Cloudflare Access for authentication. No port-forwarding or dynamic DNS required.

**Prerequisites**: Docker, a Cloudflare account (free tier is fine), and a domain managed by Cloudflare DNS.

---

## 1 — Build the Docker image

The Vite build bakes `VITE_*` env vars into the static bundle at compile time. Pass them as `--build-arg` flags.

```bash
docker build \
  --build-arg VITE_GITHUB_OWNER=your-github-username \
  --build-arg VITE_GITHUB_REPO=vcc-wiki-content \
  --build-arg VITE_GITHUB_BRANCH=main \
  --build-arg VITE_CONTENT_PATH=content \
  -t vcc-wiki:latest .
```

Leave out `VITE_GITHUB_TOKEN` unless you want a single shared PAT baked in. The recommended setup is to leave it blank and let each user paste their own PAT at the login screen — tokens are stored only in the browser's `localStorage`.

> **Rebuild required** when: `VITE_*` values change, or you pull new app code.
> **No rebuild required** when: someone edits a wiki page. Content edits commit directly to GitHub via the API and are fetched live on every page load.

---

## 2 — Run the container

### Option A — plain `docker run`

```bash
docker run -d \
  --name vcc-wiki \
  --restart unless-stopped \
  -p 8080:8080 \
  vcc-wiki:latest
```

### Option B — Docker Compose (recommended)

Copy `.env.example` to `.env.local`, fill in your values, then:

```bash
# Build and start
docker compose --env-file .env.local up -d --build

# View logs
docker compose logs -f vcc-wiki

# Stop
docker compose down
```

The included `docker-compose.yml` mounts writable `tmpfs` volumes for Caddy's data and config directories so the container can run read-only.

### Verify it's running

```bash
curl -s http://localhost:8080/ | head -5
# Should return the HTML shell with <title>VCC Wiki</title>
```

---

## 3 — Cloudflare Tunnel

A Cloudflare Tunnel creates an outbound-only connection from your homelab to Cloudflare's edge. No inbound firewall rules. No dynamic DNS.

### Install `cloudflared`

```bash
# Debian / Ubuntu
curl -L https://pkg.cloudflare.com/cloudflare-main.gpg \
  | sudo tee /usr/share/keyrings/cloudflare-main.gpg >/dev/null
echo 'deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared focal main' \
  | sudo tee /etc/apt/sources.list.d/cloudflared.list
sudo apt update && sudo apt install cloudflared

# macOS
brew install cloudflare/cloudflare/cloudflared
```

### Authenticate and create the tunnel

```bash
# Open the browser auth URL and log in to your Cloudflare account
cloudflared tunnel login

# Create a named tunnel
cloudflared tunnel create vcc-wiki

# Note the tunnel UUID printed — you'll need it below
```

### Configure the tunnel

Create `~/.cloudflared/config.yml` (or `/etc/cloudflared/config.yml` for system service):

```yaml
tunnel: <YOUR-TUNNEL-UUID>
credentials-file: /home/<user>/.cloudflared/<YOUR-TUNNEL-UUID>.json

ingress:
  - hostname: wiki.example.com
    service: http://localhost:8080
  - service: http_status:404
```

Replace `wiki.example.com` with your actual subdomain. The final catch-all rule is required by `cloudflared`.

### Create the DNS record

```bash
cloudflared tunnel route dns vcc-wiki wiki.example.com
```

This creates a `CNAME` record pointing `wiki.example.com` to the Cloudflare Tunnel endpoint.

### Run as a system service

```bash
sudo cloudflared service install
sudo systemctl enable --now cloudflared
```

The tunnel will now start automatically on boot.

### Test

```bash
curl -s https://wiki.example.com/ | head -5
```

---

## 4 — Cloudflare Access (private access control)

Cloudflare Access adds an identity check in front of the tunnel so only you (or your team) can reach the wiki. No VPN required.

### Create an Access application

1. Go to **Cloudflare Dashboard → Zero Trust → Access → Applications**.
2. Click **Add an application** → **Self-hosted**.
3. Fill in:
   - **Application name**: `VCC Wiki`
   - **Session duration**: `30 days`
   - **Application domain**: `wiki.example.com`
4. Click **Next**.

### Create an Access policy

1. **Policy name**: `Owners only` (or similar)
2. **Action**: Allow
3. **Include** rule:
   - **Selector**: Email
   - **Value**: your email address (e.g. `you@example.com`)
4. Click **Next**, then **Add application**.

From now on, visiting `wiki.example.com` will redirect to a Cloudflare Access login page. Only email addresses matching your policy can proceed.

> **Note**: Cloudflare Access uses a one-time email code or an identity provider (GitHub, Google, etc.) for authentication. No password to manage.

---

## 5 — Updating the app

### Pull new code and rebuild

```bash
git pull
docker compose --env-file .env.local up -d --build
```

Docker Compose will rebuild the image, stop the old container, and start the new one. Downtime is typically under 5 seconds.

### Updating content (no rebuild needed)

Wiki pages are stored in your separate `vcc-wiki-content` GitHub repo. Any edit made through the wiki UI commits directly to GitHub and is visible immediately on the next page load. No container restart, no image rebuild.

### Rotating your GitHub PAT

1. Generate a new fine-grained PAT following `docs/WIKI_REPO_SETUP.md`.
2. If the token is baked in (`VITE_GITHUB_TOKEN`): update `.env.local` and rebuild.
3. If the token is entered at login: paste the new token in the login screen. The old token stored in `localStorage` is replaced automatically on the next login.

---

## Quick-start checklist

- [ ] `.env.local` created from `.env.example`
- [ ] Docker image built successfully
- [ ] Container running on port 8080
- [ ] `cloudflared` installed and authenticated
- [ ] Tunnel created and DNS routed
- [ ] `cloudflared` running as a system service
- [ ] Cloudflare Access application created with email policy
- [ ] Wiki loads at `https://wiki.example.com`
- [ ] Login works with your GitHub PAT
- [ ] Calendar reminder set for PAT rotation
