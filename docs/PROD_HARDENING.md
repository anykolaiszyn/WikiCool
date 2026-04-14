# Production Hardening

Operational reference for running VCC Wiki in a private homelab. Each section is independent — apply what is relevant to your deployment.

---

## Cloudflare Access

Cloudflare Access sits in front of your wiki origin and ensures that only authorised users can reach it at all, even before the app's own auth layer. This is defence-in-depth: a bug in the React app cannot expose content to unauthenticated internet users.

### 1. Create an application

1. In the Cloudflare dashboard go to **Zero Trust → Access → Applications → Add an application**.
2. Choose **Self-hosted**.
3. Fill in:
   - **Application name**: VCC Wiki
   - **Session duration**: 24 hours (adjust to taste — shorter is safer)
   - **Application domain**: `wiki.example.com` (your Cloudflare Tunnel hostname)
4. Click **Next**.

### 2. Add an email policy

Under **Policies → Add a policy**:

| Field | Value |
|---|---|
| Policy name | Team |
| Action | Allow |
| Include rule | Emails → `you@example.com`, `teammate@example.com` |

This is the simplest policy. Alternatives:
- **Email domain**: allow `@yourcompany.com` — any address on the domain.
- **GitHub**: allow specific GitHub org members via the GitHub IdP integration.

Avoid "Everyone" — it defeats the purpose.

### 3. Session duration

- **24 h** is a sensible default for daily internal use.
- If the wiki is accessed from shared or untrusted devices, shorten to **4 h** or **1 h**.
- Users re-authenticate with one click through Cloudflare's Access login page; there is no stored PAT to re-enter.

### 4. Service token for automation

Automation (CI/CD, scheduled backups, synthetic monitoring) cannot go through the browser IdP flow. Use a **service token** instead:

1. Zero Trust → Access → Service Auth → Create Service Token.
2. Name it `vcc-wiki-automation`. Note the `CF-Access-Client-Id` and `CF-Access-Client-Secret` values — they are shown once.
3. Add a second policy to your Access application:
   - **Policy name**: Automation
   - **Action**: Service Auth
   - **Include**: Service Token → `vcc-wiki-automation`
4. Pass the credentials as HTTP headers in any automated request:

```
CF-Access-Client-Id: <client-id>
CF-Access-Client-Secret: <client-secret>
```

Service tokens do not expire by default; rotate them annually or whenever a token may have been exposed.

---

## PAT rotation

Fine-grained PATs expire. GitHub emails you 7 days before expiration. Act before it expires — an expired token causes a silent 401 on the next page load.

### Rotation procedure

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Click **Generate new token** for the content repo with the same permissions as the original (`Contents: Read and write`, `Metadata: Read-only`).
3. Copy the new token.
4. If baked into `.env.local` / the Docker image, update the value and rebuild:
   ```bash
   # Edit .env.local
   VITE_GITHUB_TOKEN=github_pat_<new>

   # Rebuild
   docker build \
     --build-arg VITE_GITHUB_TOKEN=github_pat_<new> \
     --build-arg VITE_GITHUB_OWNER=<owner> \
     --build-arg VITE_GITHUB_REPO=<repo> \
     --build-arg VITE_GITHUB_BRANCH=main \
     --build-arg VITE_CONTENT_PATH=content \
     -t vcc-wiki:latest .
   docker compose up -d
   ```
5. If using the runtime PAT prompt (not baked in): sign out in the wiki app, paste the new token at the login screen.
6. Revoke the old token in GitHub settings once the new one is confirmed working.
7. If OAuth is configured, the `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` in the Cloudflare Worker are OAuth App credentials (not PATs) and do not expire — but rotate the `GITHUB_CLIENT_SECRET` if it may have been exposed:
   ```bash
   # Regenerate in GitHub → Settings → Developer settings → OAuth Apps → <app> → Generate a new client secret
   npx wrangler secret put GITHUB_CLIENT_SECRET   # in oauth-worker/
   ```

### Reminder: set a calendar event

Set a recurring calendar reminder 80 days from each PAT's creation date (GitHub's maximum is 90 days; 80 days gives comfortable lead time). Include the token name and target repo in the event description.

---

## Backup strategy

The content repo on GitHub **is** the primary backup. Every edit is a commit; the full history is retained. This section covers secondary copies for resilience against accidental force-push, account suspension, or GitHub outage.

### Option A: scheduled `git clone --mirror` to a NAS (recommended)

A bare mirror clone contains every ref and the full object graph.

```bash
# Initial clone to NAS
git clone --mirror git@github.com:<owner>/vcc-wiki-content.git \
  /mnt/nas/backups/vcc-wiki-content.git

# Update (run on a cron)
cd /mnt/nas/backups/vcc-wiki-content.git && git remote update
```

Add to crontab (`crontab -e`):

```cron
0 3 * * * cd /mnt/nas/backups/vcc-wiki-content.git && git remote update >> /var/log/vcc-wiki-backup.log 2>&1
```

To restore from the mirror:

```bash
# Re-push to a new GitHub repo
git push --mirror git@github.com:<owner>/vcc-wiki-content-restored.git
```

### Option B: github-backup

[github-backup](https://github.com/josegonzalez/python-github-backup) backs up issues, wikis, PRs, and releases in addition to the git objects. Useful if you also use those GitHub features for the content repo.

```bash
pip install github-backup
github-backup <owner> \
  --token <pat> \
  --output-directory /mnt/nas/backups/github \
  --repository vcc-wiki-content \
  --repositories \
  --lfs-clone
```

### Option C: Cloudflare R2 via rclone

If your homelab NAS is unavailable, push mirror archives to R2 (S3-compatible, generous free tier):

```bash
# Bundle and upload
git -C /mnt/nas/backups/vcc-wiki-content.git bundle create /tmp/wiki-$(date +%F).bundle --all
rclone copyto /tmp/wiki-$(date +%F).bundle r2:vcc-wiki-backups/wiki-$(date +%F).bundle
```

### Recovery time objective

| Scenario | Recovery |
|---|---|
| Accidental file deletion | `git revert` or restore from history in the wiki UI |
| Force-push wipe | Restore from NAS mirror: `git push --mirror` |
| GitHub account suspension | Clone from NAS mirror to a new provider (GitLab, Gitea) |
| Full NAS failure | Clone from GitHub (primary still intact) |

---

## Monitoring

### Uptime Kuma

[Uptime Kuma](https://github.com/louislam/uptime-kuma) is a self-hosted uptime monitor that runs as a Docker container.

1. Add an **HTTP(s)** monitor:
   - **URL**: `https://wiki.example.com/`
   - **Heartbeat interval**: 5 minutes
   - **Expected status code**: 200
   - **Keyword**: `VCC Wiki` (or any string in your `<title>`)
2. Add a notification channel (email, Telegram, Discord, etc.).
3. If Cloudflare Access is enabled, configure the monitor with the service token:
   - **Headers**: `CF-Access-Client-Id: …` and `CF-Access-Client-Secret: …`

### Docker log tailing

```bash
# Follow live logs
docker logs -f vcc-wiki

# Last 100 lines with timestamps
docker logs --tail 100 --timestamps vcc-wiki

# Errors only
docker logs vcc-wiki 2>&1 | grep -i error
```

Caddy (the app server in the Docker image) logs to stdout in Common Log Format. Each request line includes the status code, bytes transferred, and latency.

### Log rotation

Add a `logging` block to `docker-compose.yml` to prevent unbounded log growth:

```yaml
services:
  wiki:
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "5"
```

This caps each log file at 10 MB and keeps 5 rotations (50 MB max).

---

## Upgrade path

### Dependency updates

```bash
# Check for outdated packages
npm outdated

# Update within semver ranges
npm update

# Full rebuild and test
npm run build
docker build -t vcc-wiki:candidate .
```

Do not update major versions (e.g. React 18 → 19, React Router 6 → 7) without reading the migration guide and smoke-testing the full feature set.

### Staging tunnel (recommended before production swap)

Cloudflare Tunnel lets you run a second tunnel pointing to a candidate container without changing DNS.

```bash
# Run candidate on a different local port
docker run -d --name vcc-wiki-staging \
  -p 5180:8080 \
  vcc-wiki:candidate

# Create a temporary tunnel to the staging container
cloudflared tunnel --url http://localhost:5180
# Cloudflare prints a temporary *.trycloudflare.com URL
```

Test the staging URL against your content repo before promoting:

1. Verify the home page loads.
2. Edit a page and confirm the commit appears in GitHub.
3. Check the graph view, search, history view, and new-page flow.
4. Confirm Cloudflare Access blocks unauthenticated requests.

If everything passes, swap production:

```bash
docker compose pull   # or retag and push to your local registry
docker compose up -d  # Compose pulls the new image and recreates the container
```

### Zero-downtime swap

The Caddy server inside the container serves from the pre-built `/srv` directory and starts in under a second. `docker compose up -d` stops the old container and starts the new one. Typical downtime is < 2 seconds. If that is unacceptable, run two containers behind a local HAProxy or Caddy L4 proxy and do a rolling restart.

---

## Access audit

Perform a brief quarterly audit of all access credentials and logs.

### GitHub PATs

Go to **github.com/settings/tokens → Fine-grained tokens**:

- **Revoke any tokens** that have not been used in the last 90 days.
- **Confirm the scope** of each active token: it should only have `Contents: Read and write` and `Metadata: Read-only` on the single content repo. No organisation-wide or all-repos grants.
- **Note the expiration date** of each token and update calendar reminders.

### Cloudflare Access logs

Zero Trust → Logs → Access:

- Review the **Application** column for unexpected or unfamiliar logins.
- Check for repeated authentication failures (possible credential stuffing).
- Export logs for any date range where suspicious activity is suspected.

### OAuth app

GitHub → Settings → Developer settings → OAuth Apps → VCC Wiki:

- Review **Recent authorizations** — revoke any you do not recognise.
- Check that the callback URL still matches your deployed Worker.
- Rotate the `client_secret` if it may have been exposed.

### Service tokens

Zero Trust → Access → Service Auth:

- Revoke service tokens belonging to decommissioned automations.
- Rotate any token older than 12 months.

---

## Data classification

The content repo is a **private** GitHub repository, but "private" does not mean secret. Any person with repository access — and any token with `Contents: Read` — can read every file, including the full git history.

### What is appropriate

- Vendor contact information (name, email, phone)
- General business procedures (SOPs, checklists)
- Event records (venue, attendance, notes)
- Product catalogue (SKUs, categories, descriptions)
- Public-facing pricing (MSRP)

### What requires caution

| Data | Recommendation |
|---|---|
| **Cost pricing** (`case_cost`, `landed_cost`, `otp_adjusted_cost`) | Safe to include if only the business owner and buyer have repo access. Review who has access before adding. |
| **Payment account details** | Do not store bank routing numbers, ACH credentials, or full credit card numbers anywhere in the repo. |
| **Employee personal data** | Limit to name, role, and work contact. Do not store home addresses, personal phone numbers, or compensation details. |
| **Legal documents** | Signed contracts, NDAs, permits should live in a document management system with stricter access controls, not in a wiki repo. Link to the DMS location instead. |
| **Login credentials** | Never. Use a password manager. |

### Compartmentalisation option

If you need cost/pricing data in the wiki but want to limit who can see it:

1. Create a second private content repo (`vcc-wiki-content-pricing`).
2. Deploy a second wiki instance pointing at that repo, protected by a stricter Cloudflare Access policy (owner-only email list).
3. Wikilinks between the two wikis become plain URLs in this scenario — full cross-wiki wikilinks are not currently supported.

Alternatively, keep a `pricing/` folder in the same repo but strictly limit repository access to the people who should see that data.

### Before onboarding a new user

- Confirm what repositories they are being granted access to.
- Review any existing pages that contain sensitive data before expanding access.
- Do not grant write access to anyone who does not need to edit pages.
