# Cloudflare Protected Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the local Docker website at `https://preview.mariaclaraclothing.com` through an email-protected Cloudflare Tunnel while preserving the apex domain for launch.

**Architecture:** Add a hardened `cloudflared` sidecar through a separate Compose overlay. The remotely managed tunnel receives its secret token from the ignored root `.env`, shares the private Compose network, and forwards only to the nginx `web:80` service. Cloudflare Access protects the entire preview hostname with an explicit email allowlist before traffic enters the tunnel.

**Tech Stack:** Docker Compose, `cloudflare/cloudflared:2026.6.1`, Cloudflare Tunnel, Cloudflare Access One-Time PIN, nginx, Node test runner, curl.

---

## File Map

- Create `docker-compose.preview.yml`: optional hardened Cloudflare Tunnel sidecar; no published ports and no embedded token.
- Create `apps/api/test/cloudflarePreviewDeployment.test.js`: source-level deployment contract tests for the preview overlay and operations guide.
- Create `docs/cloudflare-preview-operations.md`: exact setup, start, stop, update, verification, and recovery instructions.
- Modify `docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md`: record the implementation refinement that `cloudflared` runs as a Compose sidecar and reaches only `web:80` over the private Compose network.

The real `CLOUDFLARE_TUNNEL_TOKEN` remains only in the already ignored root `.env` file. No application source, image, test fixture, or Git commit contains it.

### Task 1: Add a Tested Preview Compose Overlay

**Files:**
- Create: `apps/api/test/cloudflarePreviewDeployment.test.js`
- Create: `docker-compose.preview.yml`
- Modify: `docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md`

- [ ] **Step 1: Write the failing deployment contract test**

Create `apps/api/test/cloudflarePreviewDeployment.test.js`:

```js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('preview overlay runs a pinned hardened tunnel without exposing ports or secrets', () => {
  const compose = read('docker-compose.preview.yml');

  assert.match(compose, /cloudflare\/cloudflared:2026\.6\.1/);
  assert.match(compose, /TUNNEL_TOKEN:\s*\$\{CLOUDFLARE_TUNNEL_TOKEN:\?/);
  assert.match(compose, /command:\s*tunnel run/);
  assert.match(compose, /restart:\s*unless-stopped/);
  assert.match(compose, /read_only:\s*true/);
  assert.match(compose, /no-new-privileges:true/);
  assert.match(compose, /cap_drop:[\s\S]*- ALL/);
  assert.doesNotMatch(compose, /^\s*ports:/m);
  assert.doesNotMatch(compose, /eyJ[A-Za-z0-9_-]{20,}/);
});

test('preview design routes the tunnel only to the nginx service', () => {
  const design = read('docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md');

  assert.match(design, /cloudflared.*Compose sidecar/i);
  assert.match(design, /`http:\/\/web:80`/);
  assert.match(design, /Port `3000`.*PostgreSQL.*never/i);
});
```

- [ ] **Step 2: Run the test and confirm the red state**

Run:

```bash
node --test apps/api/test/cloudflarePreviewDeployment.test.js
```

Expected: FAIL because `docker-compose.preview.yml` does not exist and the design does not yet describe the sidecar origin.

- [ ] **Step 3: Create the minimal hardened overlay**

Create `docker-compose.preview.yml`:

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:2026.6.1
    command: tunnel run
    environment:
      TUNNEL_TOKEN: ${CLOUDFLARE_TUNNEL_TOKEN:?CLOUDFLARE_TUNNEL_TOKEN is required for the preview tunnel}
    restart: unless-stopped
    read_only: true
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    depends_on:
      - web
```

Do not add `ports`, a token value, or a mount containing repository files.

- [ ] **Step 4: Align the approved design with the sidecar implementation**

In `docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md`, replace the local daemon wording with these explicit decisions:

```markdown
- Run `cloudflared` as an optional Docker Compose sidecar using the pinned official image.
- Route the remotely managed tunnel only to `http://web:80` on the private Compose network.
- Do not publish ports from the tunnel sidecar or expose API port `3000` or PostgreSQL through Cloudflare.
```

Update the architecture diagram so the tunnel terminates at the sidecar and then reaches `web:80`; retain the requirement that only nginx is the application gateway.

- [ ] **Step 5: Verify the green state and rendered Compose configuration**

Run:

```bash
node --test apps/api/test/cloudflarePreviewDeployment.test.js
CLOUDFLARE_TUNNEL_TOKEN=test-only-token docker compose -f docker-compose.yml -f docker-compose.preview.yml config --quiet
git diff --check
```

Expected: 2 tests pass, Compose exits 0, and the diff check reports no errors.

- [ ] **Step 6: Commit the deployment contract**

```bash
git add apps/api/test/cloudflarePreviewDeployment.test.js docker-compose.preview.yml docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md
git commit -m "feat: add protected preview tunnel overlay"
```

### Task 2: Add Operations and Secret-Handling Documentation

**Files:**
- Modify: `apps/api/test/cloudflarePreviewDeployment.test.js`
- Create: `docs/cloudflare-preview-operations.md`

- [ ] **Step 1: Add a failing operations-guide contract test**

Append:

```js
test('preview operations guide documents protected lifecycle and verification', () => {
  const guide = read('docs/cloudflare-preview-operations.md');

  assert.match(guide, /preview\.mariaclaraclothing\.com/);
  assert.match(guide, /CLOUDFLARE_TUNNEL_TOKEN/);
  assert.match(guide, /One-time PIN/i);
  assert.match(guide, /explicit email/i);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml up -d/);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml logs/);
  assert.match(guide, /docker compose -f docker-compose\.yml -f docker-compose\.preview\.yml stop cloudflared/);
  assert.match(guide, /Do not run.*-v/is);
  assert.match(guide, /127\.0\.0\.1:8081\/api\/health/);
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```bash
node --test apps/api/test/cloudflarePreviewDeployment.test.js
```

Expected: the original 2 tests pass and the new test fails because the guide is missing.

- [ ] **Step 3: Write the operations guide**

Create `docs/cloudflare-preview-operations.md` with these exact sections and commands:

```markdown
# Cloudflare Preview Operations

The protected preview is `https://preview.mariaclaraclothing.com`. It is a temporary test environment hosted by the Mac, not the permanent customer deployment.

## Security rules

- Cloudflare Access must allow only explicit email addresses through One-time PIN.
- Store `CLOUDFLARE_TUNNEL_TOKEN` only in the ignored root `.env`.
- Never paste the tunnel token into chat, screenshots, source files, or Git.
- Never publish API port `3000` or PostgreSQL through Cloudflare.

## Local preflight

```bash
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:8081/api/health
```

## Start or update the preview

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.preview.yml ps
docker compose -f docker-compose.yml -f docker-compose.preview.yml logs --tail=100 cloudflared
```

## Stop only internet access

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml stop cloudflared
```

This leaves the website, database, and uploads running locally. Do not run `docker compose down -v`; `-v` removes persistent database and upload volumes.

## Development updates

Edit the repository normally, run tests, and rebuild with the preview command above. The hostname and Access policy remain unchanged.

## Verification

- A private browser session must show Cloudflare Access before the website.
- An unapproved email must not receive access.
- An approved email signs in with One-time PIN and can load the storefront, `/admin`, and `/api/health`.
- `docker compose ps` must show PostgreSQL healthy and `cloudflared` running.

## Recovery

If the preview is unavailable, verify Docker, local health, tunnel logs, internet connectivity, and the Cloudflare tunnel status in that order. Rotate the token in Cloudflare immediately if it is exposed, update `.env`, and recreate only the `cloudflared` service.
```

- [ ] **Step 4: Run the deployment tests**

```bash
node --test apps/api/test/cloudflarePreviewDeployment.test.js
git diff --check
```

Expected: 3 tests pass and the diff check is clean.

- [ ] **Step 5: Commit the guide**

```bash
git add apps/api/test/cloudflarePreviewDeployment.test.js docs/cloudflare-preview-operations.md
git commit -m "docs: add Cloudflare preview operations guide"
```

### Task 3: Configure Cloudflare Access and the Remotely Managed Tunnel

**External state:** Cloudflare dashboard for `mariaclaraclothing.com`; ignored local `.env`.

- [ ] **Step 1: Record a safe preflight snapshot**

Run:

```bash
git status --short
docker compose ps
curl -fsS http://127.0.0.1:8081/api/health
docker volume ls --format '{{.Name}}' | sort
```

Expected: the branch contains only intended work, the existing containers are running, health returns `{"ok":true,"service":"maria-clara-clothing"}`, and the existing `pgdata` and `uploads` volumes are listed.

- [ ] **Step 2: Enable One-Time PIN in Cloudflare Zero Trust**

In Cloudflare Dashboard:

1. Open **Zero Trust → Settings → Authentication → Login methods**.
2. Add **One-time PIN** if it is not already enabled.
3. Do not enable a policy that allows everyone or all valid emails.

Expected: One-time PIN appears as an enabled login method.

- [ ] **Step 3: Create the Access application before starting the tunnel**

In **Zero Trust → Access → Applications**:

1. Add a **Self-hosted** application named `Maria Clara Preview`.
2. Set the public hostname to `preview.mariaclaraclothing.com` with no path restriction.
3. Set session duration to 24 hours.
4. Create an **Allow** policy named `Approved preview testers`.
5. Use **Include → Emails** and enter only the user's explicitly supplied testing email address.
6. Select One-time PIN as the allowed login method.
7. Confirm there is no Bypass, Everyone, or Emails ending in rule.

Expected: the whole preview hostname, including `/admin`, `/api`, and media, requires Access authentication.

- [ ] **Step 4: Create the remotely managed tunnel and hostname route**

In **Cloudflare Dashboard → Networking → Tunnels**:

1. Create a Cloudflared tunnel named `maria-clara-preview`.
2. Select Docker as the connector environment.
3. Add a published application route for `preview.mariaclaraclothing.com`.
4. Set service type to HTTP and origin URL to `http://web:80`.
5. Confirm no route exists for port `3000`, PostgreSQL, the apex domain, or `www`.

Expected: Cloudflare creates the proxied tunnel DNS record for `preview`; the connector may remain offline until Task 4.

- [ ] **Step 5: Store the tunnel token locally without displaying it**

Copy only the tunnel token from Cloudflare's Docker command. In a local editor, add `CLOUDFLARE_TUNNEL_TOKEN=` to the ignored root `.env` and place the copied value immediately after the equals sign.

Do not paste the token into the terminal transcript or conversation. Verify only the variable name and ignored status:

```bash
git check-ignore -v .env
git status --short
```

Expected: `.env` is ignored and no credential file is staged or untracked.

### Task 4: Start and Verify the Internet Preview

**External state:** Docker and Cloudflare.

- [ ] **Step 1: Validate Compose without revealing the token**

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml config --quiet
```

Expected: exit 0. Do not print the rendered environment because it contains the resolved tunnel token.

- [ ] **Step 2: Build and start the complete preview stack**

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.preview.yml ps
docker compose -f docker-compose.yml -f docker-compose.preview.yml logs --tail=100 cloudflared
```

Expected: PostgreSQL is healthy; API, web, and cloudflared are running; cloudflared reports registered connections without printing the token.

- [ ] **Step 3: Verify local health remains intact**

```bash
curl -fsS http://127.0.0.1:8081/api/health
```

Expected: `{"ok":true,"service":"maria-clara-clothing"}`.

- [ ] **Step 4: Verify Access blocks anonymous traffic**

```bash
curl -sS -o /dev/null -D - https://preview.mariaclaraclothing.com
```

Expected: a Cloudflare Access redirect or denial, not the storefront HTML.

- [ ] **Step 5: Verify approved browser access**

Open `https://preview.mariaclaraclothing.com` in a private browser window, request a One-time PIN using the approved email, and verify:

- storefront home loads over HTTPS;
- a product and collection route load;
- `/admin` reaches the application's admin login only after Cloudflare authentication;
- `/api/health` returns the health JSON;
- phone-width and desktop-width pages do not overflow;
- the browser console has no new errors.

- [ ] **Step 6: Verify data volumes survived the rebuild**

```bash
docker volume ls --format '{{.Name}}' | sort
docker compose exec -T postgres pg_isready -U postgres -d maria_clara
```

Expected: the same `pgdata` and `uploads` volumes remain and PostgreSQL accepts connections.

### Task 5: Full Regression, Security Audit, and Final Commit

**Files:**
- All files from Tasks 1 and 2.

- [ ] **Step 1: Run full automated verification**

```bash
(cd apps/api && npm test)
(cd apps/web && node --test test/*.test.js)
(cd apps/web && npm run build)
node --test apps/api/test/cloudflarePreviewDeployment.test.js
git diff --check
```

Expected: API suite has no failures, all web tests pass, the Vite production build exits 0, 3 preview deployment tests pass, and the diff check is clean.

- [ ] **Step 2: Audit for credential leakage**

```bash
git status --short
git diff --cached --name-only
rg -n 'CLOUDFLARE_TUNNEL_TOKEN=eyJ|eyJ[A-Za-z0-9_-]{20,}' --glob '!node_modules/**' --glob '!apps/web/dist/**' .
```

Expected: no actual tunnel token appears in tracked or staged files. The literal variable name is allowed; a JWT-like value is not.

- [ ] **Step 3: Recheck the running preview**

```bash
docker compose -f docker-compose.yml -f docker-compose.preview.yml ps
curl -fsS http://127.0.0.1:8081/api/health
```

Expected: all four services are running, PostgreSQL is healthy, and local API health succeeds. Complete the authenticated browser check again after the final build.

- [ ] **Step 4: Commit any remaining verified documentation/build changes**

```bash
git add docker-compose.preview.yml apps/api/test/cloudflarePreviewDeployment.test.js docs/cloudflare-preview-operations.md docs/superpowers/specs/2026-07-04-cloudflare-protected-preview-design.md docs/superpowers/plans/2026-07-04-cloudflare-protected-preview.md apps/web/dist
git commit -m "docs: finalize protected preview deployment"
```

Skip this commit if all tracked changes were already committed and `git status --short` is empty.

- [ ] **Step 5: Report the operational boundary**

Report the preview URL, Access protection result, Docker health, test counts, and exact commit hashes. State clearly that the preview goes offline when the Mac, Docker Desktop, internet connection, or tunnel container stops, and that the apex domain remains reserved for permanent production deployment.
