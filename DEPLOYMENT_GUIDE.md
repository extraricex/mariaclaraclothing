# Maria Clara Clothing Deployment Guide

Last repository audit: 2026-07-11

This runbook deploys the actual Maria Clara Clothing repository to an Ubuntu VPS
using GitHub, Docker Compose, PostgreSQL, Cloudflare DNS, and Caddy HTTPS. It also
defines how to keep making changes with Codex after launch without editing the
production server directly.

Replace every value written as `YOUR_...` before running a command. Run local
commands on the Mac unless a section explicitly says **On the VPS**.

## 1. What Is In This Repository

The following details come from the current project files, not from a generic
deployment template.

| Area | Actual implementation | Production implication |
| --- | --- | --- |
| Monorepo | npm workspaces in `package.json` | Run install, test, and build commands from the repository root. |
| Frontend | React 18, React Router 6, Vite 6, and Tailwind 4 in `apps/web` | Vite builds static files; nginx serves them. |
| Backend | Node.js CommonJS and Express 4 in `apps/api` | There is no backend compile step; production starts `node src/server.js`. |
| Database | PostgreSQL through `pg`; JSON repositories are development/test fallbacks | PostgreSQL is mandatory when `APP_ENV=production`. |
| Local Docker | `docker-compose.yml` | For local testing only; it publishes web on `8081` and API on `3000`. |
| Production Docker | `deploy/docker-compose.production.yml` | Runs PostgreSQL 16, the API, and the web/nginx container. Only web is published, on localhost by default. |
| Internal proxy | `apps/web/nginx.conf` | `/api`, `/uploads`, `/brand`, and `/data` are proxied to the private API container. |
| Public proxy | Not stored in the repo | Install Caddy on the VPS for domain routing and automatic HTTPS. |
| Persistent data | Named volumes `maria_clara_postgres_data`, `maria_clara_uploads`, and `maria_clara_issue_uploads` | Back up all three. A Git checkout does not contain customer orders or uploaded images. |
| Admin | React routes under `/admin`; single-admin cookie/CSRF authentication | Production login must be tested over HTTPS. There are no roles or MFA. |
| Checkout | Server-authoritative quote and order flow in PostgreSQL | Price, discounts, shipping, payment availability, and stock are rechecked by the API. |
| Payments | COD enabled by default; GCash and bank transfer are optional instruction-based methods | There is no payment gateway or automatic payment verification. COD is the ready-to-use path. |
| Pancake POS | Server-side REST client, authenticated order webhook, catalog/inventory reconciliation, export, and recovery polling workers | API credentials and the webhook secret stay in the API environment. |
| CI | `.github/workflows/ci.yml` | Pull requests and `main` run API tests, PostgreSQL integration tests, web tests/build, and the checkout browser journey. |

### Build, start, and test commands

From the repository root:

```bash
npm ci
npm test
node --test apps/web/test/*.test.js
npm run build:web
npm run test:e2e -w apps/web
```

Individual development commands:

```bash
npm run dev:api
npm run dev:web
npm start
```

Production Compose command:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build --remove-orphans
```

The API container automatically applies `db/schema.sql` and all unapplied files
in `apps/api/db/migrations` on every start. It seeds `apps/api/data/products.json`
only when the PostgreSQL product table is empty. At this audit, the seed contains
15 products and `apps/api/data/orders.json` contains no orders. Review seed data
again before a brand-new production database is created.

### Environment variables

The complete non-secret reference is in `.env.example`. The production Compose
template is `deploy/production.env.example`.

Required by the production Compose stack or production validation:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `DATABASE_URL`
- `ADMIN_TOKEN`
- `ADMIN_PASSWORD`
- `CUSTOMER_AUTH_SECRET` with at least 32 characters
- `ORDER_CONFIRMATION_SECRET` with at least 32 characters
- `VITE_FACEBOOK_META_PIXEL_ID` because the current production Compose file requires it

Production Compose fixes `APP_ENV=production` and API `PORT=3000`. Keep those
values in the env file for clarity, but changing them there does not override the
Compose definition.

Recommended production settings:

- `HTTP_PORT=127.0.0.1:8081`
- `TRUST_PROXY=2` for the documented Caddy -> nginx -> Express path
- `CHECKOUT_V2_REQUIRED=true`
- `PANCAKE_MODE=disabled` and `PANCAKE_AUTO_SYNC_ENABLED=false` for the first boot
- `JNT_INTEGRATION_MODE=dry_run`

Optional groups are documented in the env example: Pancake POS, Meta Pixel/CAPI,
Semaphore SMS, Resend email, J&T placeholders, and endpoint rate limits.

Do not set production JSON file overrides such as `ORDERS_DATA_FILE`,
`PRODUCTS_DATA_FILE`, or `STORE_SETTINGS_FILE`. Do not put server credentials in a
`VITE_...` variable because Vite values are built into public browser JavaScript.

### Important production boundaries

- `/api/health` is a liveness response. It does not query PostgreSQL, uploads, or
  Pancake. A green health response is not a complete go-live test.
- The frontend intentionally calls relative `/api/...` URLs. There is no
  `VITE_API_URL` or separate production API hostname to configure.
- Production cookies are `Secure`; admin and customer login will not work
  correctly through a plain HTTP public URL.
- The admin is one shared account without MFA or roles. Use a unique password and
  restrict who receives it.
- Changing the password in Admin > Settings stores an scrypt hash in PostgreSQL.
  After that, changing `ADMIN_PASSWORD` in the env file does not reset the stored
  password.
- Cancelling an order is transactional and restores stock once. Cancellation is
  terminal, and order line items are immutable after checkout; use a separate
  inventory correction/reconciliation for operational stock adjustments.
- Once Pancake auto-sync is enabled, the selected Pancake warehouse is the stock
  source of truth. Reconciliation writes its absolute remaining quantities into
  local variants, so a manual admin stock correction can be overwritten next cycle.
- J&T live booking is not implemented; any non-`dry_run` mode is unavailable.
- Pancake order webhooks are authenticated with `PANCAKE_WEBHOOK_SECRET` and the
  `X-Maria-Clara-Pancake-Secret` request header. A five-minute incremental poll
  remains enabled as recovery for a delayed or missed webhook.
- The Report Issue widget appears on normal storefront pages and Thank You, but
  not on the standalone checkout route. Webhook notification works; the stored
  email/push notification settings do not send email or push messages yet.
- Issue screenshots use a separate private volume and an authenticated admin
  endpoint. Deleting a report also deletes its screenshot. Customers should still
  remove passwords, payment details, and identity documents before uploading.
- The uploads named volume replaces `/app/public/uploads` inside each new API
  image. Future code commits that add files under that source directory will not
  populate an existing production volume automatically; use admin upload or an
  explicit, backed-up migration. Code rollback does not roll uploads back.
- The web Dockerfile installs from the committed monorepo lockfile with `npm ci`.
  Commit dependency and lockfile changes together, and run the full tests on every rebuild.
- Keep one API replica. The rate limiter and background workers are designed for
  a single process, not horizontal scaling.

## 2. Recommended Production Architecture

Use this initial topology:

```text
Customers
   |
Cloudflare DNS (DNS-only during initial launch)
   |
Caddy on ports 80/443 (HTTPS)
   |
127.0.0.1:8081
   |
Docker web/nginx
   |-- static React storefront and admin
   `-- /api and uploads -> private Express API
                              |
                              `-- private PostgreSQL 16
```

Recommended components:

- **GitHub**: source control, pull requests, CI, and `main` as the production source.
- **Ubuntu VPS**: start with 2 vCPU, 4 GB RAM, and at least 40 GB SSD. A 2 GB VPS
  may work but has less room for Docker builds, PostgreSQL, images, and backups.
- **Docker Compose**: matches the repository's existing production layout and
  preserves PostgreSQL/uploads in named volumes.
- **Caddy**: simpler certificate issuance and renewal than maintaining manual
  Nginx/Certbot configuration. The app's nginx remains inside Docker.
- **Cloudflare**: authoritative DNS initially. Keep records DNS-only until HTTPS
  and client-IP behavior have been verified.
- **Off-server backups**: daily database and uploads backups, copied to a different
  provider/account plus periodic restore tests.

Why DNS-only first: the app rate limits by client IP and the documented direct
path has exactly two trusted proxy hops, Caddy and Docker nginx. Turning on the
Cloudflare proxy adds another trust boundary and can make the API see a shared
Cloudflare address unless Caddy is configured with Cloudflare's current trusted
IP ranges. Launch DNS-only, then enable the proxy only as a separate tested change.

## 3. Step 1 - Prepare GitHub And Production Code

The repository already has:

- `origin`: `https://github.com/extraricex/mariaclaraclothing.git`
- `main`: production branch
- `codex-edits`: development/Codex branch

The current working tree contains many uncommitted application changes. Do not
run `git remote add origin`, `git branch -M main`, `git checkout -B codex-edits`,
or a blind `git add .`; those generic commands can overwrite branch intent or
include an unintended file.

### 3.1 Inspect the current work

```bash
cd /Users/ariancarloparedes/Documents/MCCWEBSITEUPDATE/mariaclaraclothing
git status --short --branch
git remote -v
git branch -vv
git diff --check
git diff --stat
```

Confirm these stay untracked/ignored:

```bash
git check-ignore -v .env deploy/production.env
```

Never commit:

- `.env`
- `deploy/production.env`
- Pancake API keys
- database/admin passwords
- provider access tokens
- database dumps or customer exports

### 3.2 Test `codex-edits`

```bash
git switch codex-edits
npm ci
npm test
node --test apps/web/test/*.test.js
npm run build:web
```

For the browser checkout suite, first create a local `.env` with safe local
values and keep Pancake disabled, then run:

```bash
docker compose up -d --build --force-recreate
npm run test:e2e -w apps/web
docker compose ps
```

### 3.3 Commit only reviewed files

```bash
git status --short
git add PATH_TO_REVIEWED_FILE ANOTHER_REVIEWED_FILE
git diff --cached --check
git diff --cached
git commit -m "Prepare Maria Clara production deployment"
git push -u origin codex-edits
```

Open a GitHub pull request from `codex-edits` into `main`. Wait for the repository's
CI workflow to pass. Review the changed-files tab, especially env examples,
database migrations, checkout, inventory, and Pancake files.

After approval, merge in GitHub. If using the command line instead:

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff codex-edits
git push origin main
git switch codex-edits
git merge main
```

Recommended GitHub settings:

1. Protect `main` with a ruleset.
2. Require a pull request before merge.
3. Require the CI check to pass.
4. Block force pushes and branch deletion.
5. Do not add production secrets to repository variables unless a future CI/CD
   deployment explicitly needs them.

## 4. Step 2 - Create And Secure The VPS

Use Ubuntu 24.04 LTS or a currently supported Ubuntu LTS image.

### 4.1 First login as root

```bash
ssh root@YOUR_SERVER_IP
```

### 4.2 Create the non-root deployment user

```bash
adduser deploy
usermod -aG sudo deploy
```

On the Mac, in a second terminal, install your existing public SSH key for that
user:

```bash
ssh-copy-id deploy@YOUR_SERVER_IP
ssh deploy@YOUR_SERVER_IP
```

Keep the first root session open until the `deploy` login succeeds. The `deploy`
account will be able to run Docker and is therefore security-sensitive.

## 5. Step 3 - Update Ubuntu And Configure The Firewall

**On the VPS as `deploy`:**

```bash
sudo apt update
sudo apt full-upgrade -y
sudo apt install -y ca-certificates curl git gnupg nano openssl ufw unattended-upgrades
sudo timedatectl set-timezone Asia/Manila
```

If Ubuntu reports that a reboot is required:

```bash
test -f /var/run/reboot-required && cat /var/run/reboot-required
sudo reboot
```

Reconnect, then configure the firewall before starting public services:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

Do not open `5432`, `3000`, or `8081`. The production Compose file leaves
PostgreSQL/API private and binds web port `8081` only to `127.0.0.1`.

Create application and backup directories:

```bash
sudo install -d -m 755 -o deploy -g deploy /var/www
sudo install -d -m 700 -o deploy -g deploy /var/backups/mariaclara
```

## 6. Step 4 - Install Docker Engine And Compose

Use Docker's official apt repository, not the convenience script:

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
```

```bash
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
```

```bash
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker deploy
```

Log out and back in so the group change applies:

```bash
exit
ssh deploy@YOUR_SERVER_IP
```

Verify the installation:

```bash
docker --version
docker compose version
docker run --rm hello-world
```

Reference: [Docker Engine on Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 7. Step 5 - Give The VPS Read-Only GitHub Access And Clone

For a private repository, use a read-only GitHub deploy key. The VPS only needs
to pull; do not enable write access.

**On the VPS:**

```bash
ssh-keygen -t ed25519 -C "mariaclara-production-vps" \
  -f ~/.ssh/mariaclara_deploy
cat ~/.ssh/mariaclara_deploy.pub
```

In GitHub:

1. Open `extraricex/mariaclaraclothing`.
2. Open Settings > Deploy keys > Add deploy key.
3. Name it `Maria Clara production VPS`.
4. Paste the displayed public key.
5. Leave **Allow write access** unchecked.

Create an SSH alias on the VPS:

```bash
nano ~/.ssh/config
```

Add:

```sshconfig
Host github-mariaclara
  HostName github.com
  User git
  IdentityFile ~/.ssh/mariaclara_deploy
  IdentitiesOnly yes
```

Set permissions and test it:

```bash
chmod 700 ~/.ssh
chmod 600 ~/.ssh/config ~/.ssh/mariaclara_deploy
chmod 644 ~/.ssh/mariaclara_deploy.pub
ssh -T git@github-mariaclara
```

GitHub normally prints a successful-authentication message and then says shell
access is unavailable; that is expected.

Clone only `main`:

```bash
cd /var/www
git clone --branch main \
  git@github-mariaclara:extraricex/mariaclaraclothing.git mariaclara
cd /var/www/mariaclara
git config pull.ff only
git status --short --branch
```

If the repository is public, HTTPS cloning also works, but the read-only deploy
key keeps the workflow consistent if it later becomes private. Reference:
[GitHub deploy keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

## 8. Step 6 - Create The Production Environment

**On the VPS:**

```bash
cd /var/www/mariaclara
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
```

Generate five different 64-character hex values. Hex is especially useful for
the PostgreSQL password because it is safe to place directly in a URL.

```bash
openssl rand -hex 32  # POSTGRES_PASSWORD
openssl rand -hex 32  # ORDER_CONFIRMATION_SECRET
openssl rand -hex 32  # CUSTOMER_AUTH_SECRET
openssl rand -hex 32  # ADMIN_TOKEN
openssl rand -hex 32  # ADMIN_PASSWORD, or use a password-manager password
```

Store the values in a password manager. Do not paste them into GitHub, Codex
prompts, chat, tickets, or screenshots.

Edit the file:

```bash
nano deploy/production.env
```

The core block must look like this with real values:

```dotenv
HTTP_PORT=127.0.0.1:8081

POSTGRES_DB=maria_clara
POSTGRES_USER=postgres
POSTGRES_PASSWORD=YOUR_URL_SAFE_RANDOM_POSTGRES_PASSWORD
DATABASE_URL=postgres://postgres:YOUR_SAME_POSTGRES_PASSWORD@postgres:5432/maria_clara

APP_ENV=production
PORT=3000
TRUST_PROXY=2
CHECKOUT_V2_REQUIRED=true
ORDER_CONFIRMATION_SECRET=YOUR_UNIQUE_RANDOM_SECRET
CUSTOMER_AUTH_SECRET=YOUR_DIFFERENT_RANDOM_SECRET
ADMIN_TOKEN=YOUR_DIFFERENT_RANDOM_TOKEN
ADMIN_PASSWORD=YOUR_LONG_UNIQUE_ADMIN_PASSWORD

GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
AUTH_CALLBACK_URL=https://mariaclaraclothing.com/api/customer/oauth
FRONTEND_URL=https://mariaclaraclothing.com
```

Rules:

- The two PostgreSQL password occurrences must be identical.
- Do not use `admin`, `local-admin-token`, `postgres`, or any example value as a
  production credential.
- Do not reuse one generated value for multiple settings.
- Existing guest confirmation tokens are checked against their stored hash and
  continue working after secret rotation. However, a completed checkout replayed
  with its original idempotency key derives its token again, so do not rotate
  `ORDER_CONFIRMATION_SECRET` during the 24-hour idempotency window for in-flight
  checkouts.
- Keep `TRUST_PROXY=2` for the documented DNS-only Cloudflare -> Caddy -> nginx
  topology. Use `1` only when nginx is the sole proxy in front of Express.

`POSTGRES_DB`, `POSTGRES_USER`, and `POSTGRES_PASSWORD` initialize only a new,
empty PostgreSQL volume. Editing them later does not change credentials inside an
existing database. Rotate a live database password with SQL using the current
credential, update `DATABASE_URL` and `POSTGRES_PASSWORD` together, and recreate
the services. Never delete the named volume to apply a password change.

For the first boot, keep integrations safe:

```dotenv
PANCAKE_MODE=disabled
PANCAKE_AUTO_SYNC_ENABLED=false
META_CONVERSIONS_API_ENABLED=false
ORDER_NOTIFICATIONS_ENABLED=false
JNT_INTEGRATION_MODE=dry_run
```

The Meta browser pixel ID is not a secret, but the production Compose file
currently requires it even when the pixel is disabled. Set an intended public ID:

```dotenv
VITE_FACEBOOK_META_PIXEL_ENABLED=true
VITE_FACEBOOK_META_PIXEL_ID=595813035761213
```

Check that no required placeholder remains:

```bash
grep -nE 'replace-with|YOUR_' deploy/production.env
```

The command should return no required placeholders. Empty optional provider
credentials are allowed while their feature is disabled.

### 8.1 Configure Google and Facebook customer login

OAuth credentials are optional at first deploy. When a provider credential pair
is empty, its customer login button is hidden. Never put these secrets in a
`VITE_` variable because those values are compiled into browser JavaScript.

For Google:

1. Create a Web application OAuth client in Google Cloud Console.
2. Add `https://mariaclaraclothing.com` as an authorized JavaScript origin.
3. Add the exact redirect URI
   `https://mariaclaraclothing.com/api/customer/oauth/google/callback`.
4. Put its client ID and client secret in `deploy/production.env`.

For Facebook:

1. Create a Meta app, add Facebook Login, and complete the required business,
   privacy-policy, and data-deletion details before switching it live.
2. Set the app domain to `mariaclaraclothing.com`.
3. Add the exact Valid OAuth Redirect URI
   `https://mariaclaraclothing.com/api/customer/oauth/facebook/callback`.
4. Put the app ID and app secret in `deploy/production.env`.

Use:

```dotenv
GOOGLE_CLIENT_ID=YOUR_GOOGLE_WEB_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_WEB_CLIENT_SECRET
FACEBOOK_APP_ID=YOUR_FACEBOOK_APP_ID
FACEBOOK_APP_SECRET=YOUR_FACEBOOK_APP_SECRET
AUTH_CALLBACK_URL=https://mariaclaraclothing.com/api/customer/oauth
FRONTEND_URL=https://mariaclaraclothing.com
```

After rebuilding, open Admin > Settings > Customer login and enable only the
providers that are ready. Test with a real non-admin customer account on both a
phone and desktop. A matching verified email links to the existing customer
account; provider access tokens are not stored.

Validate Compose without printing rendered secrets:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml config --quiet
```

Do not run plain `docker compose ... config` in a shared terminal or paste its
output; the rendered output contains secrets.

## 9. Step 7 - Set The Production API URL

There is no API URL variable to set. The correct production design is:

```text
Storefront: https://YOUR_DOMAIN/
Admin:      https://YOUR_DOMAIN/admin
API:        https://YOUR_DOMAIN/api/...
Uploads:    https://YOUR_DOMAIN/uploads/...
```

React calls relative paths such as `/api/products`. Docker nginx forwards those
paths to `http://api:3000`. Caddy forwards the single public domain to nginx.

Do not create `VITE_API_URL`, do not expose port `3000`, and do not place Pancake
or other API keys in the web build.

## 10. Step 8 - Set The Admin Password Safely

Before first start:

1. Set `ADMIN_PASSWORD` to a unique value of at least 20 characters or a 64-character
   random hex value.
2. Set `ADMIN_TOKEN` to a different 64-character random value.
3. Store both in a password manager.
4. Never use `admin` as the password.

`ADMIN_PASSWORD` bootstraps production login only while no persisted admin
credential exists. After changing the password in Admin > Settings > Security,
PostgreSQL becomes authoritative. Editing the env file later will not recover a
forgotten stored password, so protect the updated password and database backups.

## 11. Step 9 - Add Pancake Credentials Without Enabling Writes

Obtain these from the correct production Pancake account or Pancake support:

- API key
- shop ID
- warehouse ID that permits order creation
- order source ID

Add them only to `deploy/production.env` on the VPS:

```dotenv
PANCAKE_MODE=disabled
PANCAKE_API_BASE_URL=https://pos.pages.fm/api/v1
PANCAKE_API_KEY=YOUR_PANCAKE_API_KEY
PANCAKE_SHOP_ID=YOUR_PANCAKE_SHOP_ID
PANCAKE_WAREHOUSE_ID=YOUR_PANCAKE_WAREHOUSE_ID
PANCAKE_ORDER_SOURCE_ID=YOUR_PANCAKE_ORDER_SOURCE_ID
PANCAKE_WEBHOOK_SECRET=GENERATE_A_UNIQUE_32_PLUS_CHARACTER_SECRET
PANCAKE_AUTO_SYNC_ENABLED=false
```

Production code requires the official `https://pos.pages.fm/api/v1` host. Generate
the webhook secret on the VPS with `openssl rand -hex 32`; do not display it in
screenshots or commit it. Credentials remain server-side and are never displayed
in the admin browser.

After the HTTPS site is running, open Pancake **Settings > Advance > Third-party
connection > Webhook/API** and configure:

```text
Webhook URL: https://mariaclaraclothing.com/api/integrations/pancake/webhook
Webhook type: orders
Request header name: X-Maria-Clara-Pancake-Secret
Request header value: the exact PANCAKE_WEBHOOK_SECRET value
```

Keep the five-minute order poll enabled. It is a recovery path and uses Pancake's
documented `updated_at` time window, so it does not scan the shop's full history.

Do not switch to `live` yet. Section 19 uses `read_only`, then `shadow`, then
`live` after mappings and inventory are verified.

## 12. Step 10 - Build And Start Docker

**On the VPS:**

```bash
cd /var/www/mariaclara
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml config --quiet

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build --remove-orphans
```

The first API start applies the schema/migrations and seeds the empty product
catalog. A migration error causes the API to restart; inspect API logs rather
than repeatedly restarting it.

Check container state:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml ps
```

Expected services:

- `postgres`: healthy
- `api`: healthy
- `web`: running

Check the localhost-only entry point:

```bash
curl -fsS http://127.0.0.1:8081/api/health
curl -fsS http://127.0.0.1:8081/api/products >/dev/null
curl -fsS http://127.0.0.1:8081/api/storefront-settings >/dev/null
```

The first response should be:

```json
{"ok":true,"service":"maria-clara-clothing"}
```

The product and settings calls prove more than the static health endpoint, but a
real checkout test is still required.

## 13. Step 11 - Inspect Docker Logs

Show recent logs without leaving a command attached forever:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --tail=200 postgres api web
```

Follow logs during a test and press `Ctrl+C` to stop following. This does not stop
the containers:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs -f --tail=100 api web
```

Investigate repeated migration, database connection, `pancake_...`, HTTP 500, or
container restart messages. The production Compose file rotates each container's
JSON logs at 10 MB and keeps five files.

## 14. Step 12 - Configure The Domain In Cloudflare

1. Add the domain to Cloudflare.
2. Change the domain registrar's nameservers to the two assigned by Cloudflare.
3. In Cloudflare DNS, remove conflicting old `A`, `AAAA`, or `CNAME` records.
4. Add these records:

```text
Type: A
Name: @
Content: YOUR_SERVER_IPV4
Proxy status: DNS only (gray cloud)
TTL: Auto

Type: CNAME
Name: www
Content: YOUR_DOMAIN
Proxy status: DNS only (gray cloud)
TTL: Auto
```

Add an `AAAA` record only if the VPS has working public IPv6 and its firewall is
configured. A broken `AAAA` record can make the site fail for IPv6 visitors.

Verify from the Mac:

```bash
dig +short YOUR_DOMAIN A
dig +short www.YOUR_DOMAIN
```

The result must lead to the VPS before Caddy can obtain a public certificate.
Cloudflare's [DNS record guide](https://developers.cloudflare.com/dns/manage-dns-records/how-to/create-dns-records/)
explains record creation and its [proxy status guide](https://developers.cloudflare.com/dns/proxy-status/)
explains DNS-only versus Proxied.

Keep DNS-only through launch. Section 14.4 explains the optional Cloudflare proxy.

## 15. Step 13 - Install Caddy And Enable HTTPS

### 15.1 Install the official Caddy package

**On the VPS:**

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg
sudo chmod o+r /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

Reference: [official Caddy installation](https://caddyserver.com/docs/install).

### 15.2 Configure the reverse proxy

```bash
sudo nano /etc/caddy/Caddyfile
```

Replace its contents with:

```caddyfile
YOUR_DOMAIN, www.YOUR_DOMAIN {
  encode zstd gzip
  reverse_proxy 127.0.0.1:8081
}
```

Validate and reload without downtime:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

Caddy obtains and renews certificates automatically when DNS is correct and
ports 80/443 are reachable. Reference: [Caddy reverse proxy and automatic HTTPS](https://caddyserver.com/docs/quick-starts/reverse-proxy).

### 15.3 Test HTTPS

From the Mac:

```bash
curl -I https://YOUR_DOMAIN
curl -fsS https://YOUR_DOMAIN/api/health
curl -fsS https://YOUR_DOMAIN/api/products >/dev/null
```

On the VPS, inspect Caddy if certificate issuance fails:

```bash
sudo journalctl -u caddy --no-pager -n 200
```

### 15.4 Optional: enable the Cloudflare proxy later

Do not orange-cloud the records as part of the initial launch. If Cloudflare's
proxy is enabled later:

1. Set Cloudflare SSL/TLS mode to **Full (strict)**, never Flexible. See
   [Cloudflare Full (strict)](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/).
2. Configure Caddy to trust only Cloudflare's current published proxy CIDRs and
   handle `CF-Connecting-IP` according to Caddy's trusted-proxy documentation.
3. Restrict origin HTTP/HTTPS traffic to Cloudflare IPs if origin hiding is a goal.
4. Verify that application rate limits distinguish two real client IPs before
   relying on them.
5. Reassess `TRUST_PROXY` for the exact resulting header chain.

Cloudflare Free/Pro currently limits proxied request bodies to 100 MB, while one
admin product upload request can contain up to eight 40 MB files. Upload smaller
batches below the plan limit or keep the site DNS-only. See
[Cloudflare error 413 limits](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/).

## 16. Step 14 - Test The Live Customer Website

Use an incognito/private window so local development cookies do not interfere.

1. Open `https://YOUR_DOMAIN`.
2. Confirm the homepage and product collection load.
3. Open at least two product pages and all images.
4. Select each available size and verify sold-out/low-stock states.
5. Add a product to cart and change quantity.
6. Confirm quantity cannot exceed the selected variant's stock.
7. Test desktop and mobile widths, including 390 px and 412 px.
8. Open `/faq`, `/shipping-returns`, `/terms`, `/contact`, and `/size-chart`.
9. Test Messenger, Facebook, Instagram, TikTok if configured, email, and phone links.
10. Submit Report Issue from a normal storefront page and optionally attach a
    non-sensitive image under 5 MB. The widget is not present on `/checkout`.
11. In Admin > Issue Reports, open that report, verify its screenshot, save an
    admin note, change its status, and confirm both persist.
12. Open browser developer tools. Confirm there are no console errors, failed API
    requests, mixed-content warnings, or missing images.

Directly test settings because frontend fallbacks can make content render even if
the settings API is unavailable:

```bash
curl -fsS https://YOUR_DOMAIN/api/storefront-settings >/dev/null
```

Verify or replace the default global size-chart image URL; it currently points to
an external Shopify CDN resource and is outside this VPS backup.

## 17. Step 15 - Test The Admin Dashboard

Open only through HTTPS:

```text
https://YOUR_DOMAIN/admin/login
```

Log in with the initial `ADMIN_PASSWORD`, then test:

1. Dashboard metrics load.
2. Orders, Products, Inventory, Customers, Discounts, Banners, Settings, Pancake
   POS, and Issue Reports open without errors.
3. Edit one harmless content field, save, refresh, and confirm it persists. This
   verifies PostgreSQL-backed settings rather than frontend fallback content.
4. Upload one small test image and confirm its `/uploads/...` URL works after a
   container restart. This verifies the uploads volume.
5. Open Settings > Security, set the long-term password, and store it immediately.
6. Sign out and back in with the new password.
7. Confirm the old session/password no longer works as intended.
8. Review contact/social links, FAQ, terms, shipping, size chart, report issue,
   payment methods, shipping fees, and maintenance mode before customer traffic.

The admin is a single shared account. Do not share it with staff who should not
have full order, customer, inventory, and integration access.

## 18. Step 16 - Test Cart, Checkout, Orders, And Inventory

Keep Pancake disabled for this first local-commerce test.

1. Record the current stock of one test SKU in Admin > Inventory.
2. On the storefront, add one unit of that exact SKU.
3. Open cart and confirm totals and stock cap.
4. Open checkout and submit once with required fields missing; confirm validation.
5. Complete a controlled **Cash on Delivery** order with a real reachable test
   phone/address.
6. Confirm the Thank You page shows the correct private order details.
7. Confirm refreshing the Thank You page works while the browser retains its
   confirmation token. The server currently gives that token no time-based expiry,
   so treat it as a private credential.
8. In admin, confirm the order, customer, items, discount, shipping, payment, and
   total are correct.
9. Confirm the SKU decreased by exactly the ordered quantity.
10. Try to exceed remaining stock from another incognito session; checkout must be
    rejected or re-quoted rather than overselling.

Verify the newest database rows on the VPS:

```bash
cd /var/www/mariaclara
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT order_number,status,total_cents,placed_at FROM orders ORDER BY placed_at DESC LIMIT 5;"'
```

For the test order number:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c \
  "SELECT order_number,sku,quantity_change,reason,created_at FROM inventory_movements WHERE order_number = '\''YOUR_ORDER_NUMBER'\'' ORDER BY created_at;"'
```

If GCash or bank transfer is enabled, verify the displayed instructions and the
manual staff verification process. The website does not charge or verify those
payments automatically.

## 19. Step 17 - Roll Out And Test Pancake POS Safely

Do this before opening traffic to real customers. Use an intentional test order
that can later appear in the production Pancake shop.

### 19.1 Stage A: connection and catalog in `read_only`

Edit `deploy/production.env`:

```dotenv
PANCAKE_MODE=read_only
PANCAKE_AUTO_SYNC_ENABLED=false
```

Recreate only the API so it receives the new environment:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --force-recreate api
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml restart web
curl -fsS http://127.0.0.1:8081/api/health
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --tail=150 api
```

Restarting web makes nginx resolve the recreated API container's Docker address.

In Admin > Pancake POS:

1. Click **Test connection** and require `connected`.
2. Open advanced reference settings.
3. Verify the selected shop, warehouse, and order source.
4. Confirm the warehouse permits order creation.
5. Click **Import catalog**. Manual catalog import requires `read_only` mode.
6. Require verified mappings to equal active local variants.
7. Require zero open mapping conflicts.
8. Require price unit status `confirmed_pesos`.
9. Resolve duplicate/missing SKU and price mismatches before proceeding.

### 19.2 Verify one automatic sync cycle

On a new deployment with no linked outbound Pancake orders, temporarily set:

```dotenv
PANCAKE_MODE=read_only
PANCAKE_AUTO_SYNC_ENABLED=true
PANCAKE_AUTO_SYNC_INTERVAL_MS=60000
PANCAKE_ORDER_POLL_INTERVAL_MS=60000
```

This is not an inventory-only action. Every worker tick imports catalog, reconciles
inventory, shadow-builds queued website exports, polls recent Pancake orders into
the local database, and processes due linked-order outbound events. Confirm there
are no linked outbound events that could write before enabling it.

Recreate the API, restart web so nginx refreshes the upstream address, wait at
least 90 seconds, then refresh Admin > Pancake POS:

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --force-recreate api
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml restart web
sleep 90
curl -fsS http://127.0.0.1:8081/api/health
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --tail=200 api
```

Require inventory status `complete`, sensible stock updates, and no conflicts.
Compare several exact SKUs between the selected Pancake warehouse and the website.
Agree operationally that this warehouse is authoritative before continuing.

Then freeze the worker while reviewing:

```dotenv
PANCAKE_AUTO_SYNC_ENABLED=false
```

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --force-recreate api
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml restart web
curl -fsS http://127.0.0.1:8081/api/health
```

Important: in the current implementation, `read_only` and `shadow` are not a
guaranteed write-off switch for already-linked outbound update events when the
background worker is enabled. During an incident, set
`PANCAKE_AUTO_SYNC_ENABLED=false` or `PANCAKE_MODE=disabled`, then recreate the API.

### 19.3 Stage B: build but do not send the order in `shadow`

Set:

```dotenv
PANCAKE_MODE=shadow
PANCAKE_AUTO_SYNC_ENABLED=false
PANCAKE_AUTO_SYNC_INTERVAL_MS=600000
PANCAKE_ORDER_POLL_INTERVAL_MS=300000
```

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --force-recreate api
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml restart web
curl -fsS http://127.0.0.1:8081/api/health
```

The Stage 19.2 cycle will normally have turned Section 18's queued checkout into a
`shadow_built` row already. Inspect that existing row; a new checked count of zero
is valid when there is no remaining queued work. If no shadow row exists, place a
new order now that the API is in shadow mode and click **Check orders**.

Require no blocked/failed mapping. Shadow building does not create the Pancake
order. Its export row stays `shadow_built` and is not selected by live export
later, so Stage C must use a new controlled order.

### 19.4 Stage C: enable live polling and export

Only after Stage A/B passes, set:

```dotenv
PANCAKE_MODE=live
PANCAKE_AUTO_SYNC_ENABLED=true
# Record this immediately before enabling live mode. Historical orders before
# this UTC instant will not be backfilled or exported.
PANCAKE_ORDER_EXPORT_CUTOFF_AT=YYYY-MM-DDTHH:MM:SSZ
PANCAKE_AUTO_SYNC_INTERVAL_MS=600000
PANCAKE_ORDER_POLL_INTERVAL_MS=300000
PANCAKE_ORDER_POLL_PAGE_SIZE=50
PANCAKE_ORDER_POLL_LOOKBACK_MS=900000
PANCAKE_SYNC_MAX_ATTEMPTS=10
```

`PANCAKE_ORDER_EXPORT_CUTOFF_AT` is mandatory in live mode. Never move it
backward to import old website orders unless each order has been checked for an
existing manually-created Pancake order. Cancelled orders are excluded and a
queued export is marked skipped when its website order is cancelled.

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml config --quiet
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --force-recreate api
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml restart web
curl -fsS http://127.0.0.1:8081/api/health
```

The worker uses the smaller of the general and order-poll intervals for its single
schedule. With `600000` and `300000`, the full catalog, inventory, export, inbound,
and outbound cycle runs about every five minutes.

Test the complete path:

1. Place one controlled COD website order.
2. Allow up to `PANCAKE_REQUEST_TIMEOUT_MS` for the response because checkout
   awaits one immediate Pancake export attempt after the local transaction commits.
   If that export fails, the local order remains committed and queued for retry.
3. In admin, confirm the order shows a Pancake ID and `sent`/linked state.
4. In Pancake, confirm exactly one order exists with the website order number as
   `custom_id`.
5. Compare SKUs, quantities, customer, address, shipping, totals, and notes.
6. Change status and tracking in Pancake.
7. Wait at least one polling interval, then confirm admin reflects the changes.
8. Change an allowed linked-order field in admin and confirm the outbound update.
9. Refresh Pancake status and require queued/failed/blocked counts to be zero or
   fully explained.
10. Compare website inventory with the selected Pancake warehouse again.

An export failure does not undo the customer's local order; it remains queued for
retry. Monitor for failed, blocked, and duplicate provider orders during launch.
Use Pancake's webhook test after saving the URL and private header. Require a 200
response. Then keep the polling verification because it proves missed deliveries
will recover.

## 20. Backups Before And After Go-Live

Back up PostgreSQL, product uploads, and private issue screenshots. A same-VPS copy is useful for fast rollback
but does not protect against disk/VPS/account loss. Copy backups to encrypted
off-server storage under a separate account.

### 20.1 Install a backup script

**On the VPS:**

```bash
sudo nano /usr/local/bin/mariaclara-backup
```

Add:

```bash
#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

APP_DIR=/var/www/mariaclara
BACKUP_DIR=/var/backups/mariaclara
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DB_FILE="$BACKUP_DIR/database-$STAMP.dump"
UPLOAD_FILE="$BACKUP_DIR/uploads-$STAMP.tar.gz"
ISSUE_UPLOAD_FILE="$BACKUP_DIR/issue-uploads-$STAMP.tar.gz"
COMPOSE=(docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml)

cleanup_partial() {
  rm -f "$DB_FILE" "$UPLOAD_FILE" "$ISSUE_UPLOAD_FILE"
}
trap cleanup_partial ERR

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

"${COMPOSE[@]}" exec -T postgres sh -c \
  'pg_dump --format=custom --no-owner --no-acl -U "$POSTGRES_USER" "$POSTGRES_DB"' \
  > "$DB_FILE"
test -s "$DB_FILE"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v maria_clara_uploads:/source:ro \
  -v "$BACKUP_DIR":/backup \
  postgres:16-alpine \
  tar -czf "/backup/$(basename "$UPLOAD_FILE")" -C /source .
test -s "$UPLOAD_FILE"

docker run --rm \
  --user "$(id -u):$(id -g)" \
  -v maria_clara_issue_uploads:/source:ro \
  -v "$BACKUP_DIR":/backup \
  postgres:16-alpine \
  tar -czf "/backup/$(basename "$ISSUE_UPLOAD_FILE")" -C /source .
test -s "$ISSUE_UPLOAD_FILE"
chmod 600 "$DB_FILE" "$UPLOAD_FILE" "$ISSUE_UPLOAD_FILE"

docker run --rm \
  -v "$BACKUP_DIR":/backup:ro \
  postgres:16-alpine \
  pg_restore --list "/backup/$(basename "$DB_FILE")" >/dev/null

git rev-parse HEAD > "$BACKUP_DIR/git-$STAMP.txt"
sha256sum "$DB_FILE" "$UPLOAD_FILE" "$ISSUE_UPLOAD_FILE" > "$BACKUP_DIR/SHA256SUMS-$STAMP.txt"
trap - ERR

# Fast local retention only. Off-server retention should be longer.
find "$BACKUP_DIR" -type f -mtime +14 -delete
echo "Backup complete: $STAMP"
```

Set ownership and run it once:

```bash
sudo chown deploy:deploy /usr/local/bin/mariaclara-backup
sudo chmod 750 /usr/local/bin/mariaclara-backup
/usr/local/bin/mariaclara-backup
ls -lh /var/backups/mariaclara
```

### 20.2 Schedule daily backups

```bash
crontab -e
```

Add:

```cron
0 2 * * * /bin/bash -o pipefail -c '/usr/local/bin/mariaclara-backup 2>&1 | /usr/bin/logger -t mariaclara-backup'
```

Inspect backup job logs:

```bash
sudo journalctl -t mariaclara-backup --since "2 days ago" --no-pager
```

Configure VPS snapshots and an encrypted off-server copy. Alert if no new backup
arrives. Keep at least 14 daily, 8 weekly, and 6 monthly off-server copies if
storage permits.

### 20.3 Add encrypted off-server backups with Backblaze B2

Backblaze B2 is the recommended first off-server target for this VPS because it
works directly with restic, can use a bucket-scoped key, and is independent from
Hostinger. Restic encrypts the repository before data leaves the VPS. Losing the
restic password makes the backup unrecoverable, so store it in a password manager
outside the VPS.

In Backblaze:

1. Enable B2 Cloud Storage and create a **private** bucket with a globally unique
   name such as `mariaclara-production-backups-YOUR_RANDOM_SUFFIX`.
2. Create an application key restricted to only that bucket with Read and Write
   access. Do not use the master key.
3. Save the displayed `keyID` and `applicationKey` immediately; the secret is
   shown only once.

On the VPS:

```bash
sudo apt update
sudo apt install -y restic
install -d -m 700 /home/deploy/.config/mariaclara
cd /var/www/mariaclara
cp deploy/offsite-backup.env.example /home/deploy/.config/mariaclara/offsite-backup.env
chmod 600 /home/deploy/.config/mariaclara/offsite-backup.env
openssl rand -base64 48 > /home/deploy/.config/mariaclara/restic-password
chmod 600 /home/deploy/.config/mariaclara/restic-password
nano /home/deploy/.config/mariaclara/offsite-backup.env
```

Replace every `YOUR_...` placeholder. Store the contents of `restic-password`
in your password manager, along with the B2 bucket name and key ID. Initialize
the encrypted repository once:

```bash
set -a
source /home/deploy/.config/mariaclara/offsite-backup.env
set +a
restic init
restic snapshots
```

Install and run the provided upload script:

```bash
sudo install -m 750 -o deploy -g deploy \
  /var/www/mariaclara/deploy/mariaclara-offsite-backup \
  /usr/local/bin/mariaclara-offsite-backup
/usr/local/bin/mariaclara-offsite-backup
```

Add a second cron entry after the 2:00 AM local backup:

```cron
30 2 * * * /bin/bash -o pipefail -c '/usr/local/bin/mariaclara-offsite-backup 2>&1 | /usr/bin/logger -t mariaclara-offsite-backup'
```

Verify remote snapshots and run a weekly metadata integrity check:

```bash
set -a
source /home/deploy/.config/mariaclara/offsite-backup.env
set +a
restic snapshots
restic check
sudo journalctl -t mariaclara-offsite-backup --since "2 days ago" --no-pager
```

Perform a test restore without touching production:

```bash
mkdir -p /tmp/mariaclara-restic-restore
restic restore latest --target /tmp/mariaclara-restic-restore
find /tmp/mariaclara-restic-restore/var/backups/mariaclara -maxdepth 1 -type f | head
```

References: [restic Backblaze B2 repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html)
and [Backblaze bucket-scoped application keys](https://www.backblaze.com/docs/cloud-storage-create-and-manage-app-keys).

### 20.4 Perform a restore drill

At least monthly, restore the newest database dump into a temporary database:

```bash
cd /var/www/mariaclara
BACKUP=/var/backups/mariaclara/database-YYYYMMDDTHHMMSSZ.dump

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'dropdb --force --if-exists -U "$POSTGRES_USER" maria_clara_restore_test && \
   createdb -U "$POSTGRES_USER" maria_clara_restore_test'

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d maria_clara_restore_test' \
  < "$BACKUP"

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d maria_clara_restore_test -c \
  "SELECT count(*) AS orders FROM orders; SELECT count(*) AS products FROM products;"'

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml exec -T postgres sh -c \
  'dropdb -U "$POSTGRES_USER" maria_clara_restore_test'
```

Also test the uploads archive without changing production:

```bash
tar -tzf /var/backups/mariaclara/uploads-YYYYMMDDTHHMMSSZ.tar.gz | head
tar -tzf /var/backups/mariaclara/issue-uploads-YYYYMMDDTHHMMSSZ.tar.gz | head
```

References: [PostgreSQL `pg_dump`](https://www.postgresql.org/docs/16/app-pgdump.html)
and [`pg_restore`](https://www.postgresql.org/docs/16/app-pgrestore.html).

## 21. Continue Editing With Codex

Codex continues working in the local Mac repository. It does not need access to
the VPS and should not edit production files directly.

### 21.1 Start each change from current production

```bash
cd /Users/ariancarloparedes/Documents/MCCWEBSITEUPDATE/mariaclaraclothing
git status --short
git switch codex-edits
git fetch origin
git merge origin/main
```

Resolve any existing local work before merging. Do not discard a dirty working
tree just to update the branch.

Ask Codex to make the change. Then review and test:

```bash
git diff --check
npm test
node --test apps/web/test/*.test.js
npm run build:web
docker compose up -d --build --force-recreate
npm run test:e2e -w apps/web
```

Test the affected manual workflows too. Checkout, inventory, and Pancake changes
always require their corresponding smoke test.

### 21.2 Commit and push the Codex branch

```bash
git status --short
git add PATH_TO_REVIEWED_FILE ANOTHER_REVIEWED_FILE
git diff --cached
git commit -m "Describe the website update"
git push origin codex-edits
```

The user's example `git add .` is valid only after every changed/untracked file
has been reviewed and secret files are confirmed ignored. Selective staging is
safer in this repository because customer data fixtures and local artifacts may
also change during testing.

Open a pull request, require CI to pass, review, and merge to `main`. Command-line
alternative:

```bash
git switch main
git pull --ff-only origin main
git merge --no-ff codex-edits
git push origin main
git switch codex-edits
git merge main
```

`main` is what production pulls. Pushing only `codex-edits` never changes the live
website.

## 22. Deploy An Update To Production

For a risky update, first enable maintenance mode in Admin > Settings so new
orders receive a maintenance response. Keep a second admin session open.

### 22.1 Back up and record the current release

**On the VPS:**

```bash
cd /var/www/mariaclara
/usr/local/bin/mariaclara-backup
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
git rev-parse HEAD | tee "/var/backups/mariaclara/predeploy-git-$STAMP.txt"
```

### 22.2 Pull only a fast-forwarded `main`

```bash
git status --short --branch
git fetch origin
git switch main
git pull --ff-only origin main
```

Stop if the VPS working tree is dirty or the pull is not a fast-forward. Production
should never contain hand edits.

### 22.3 Validate, rebuild, and inspect

```bash
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml config --quiet

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build --remove-orphans

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml ps

docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml logs --tail=200 postgres api web
```

Then test:

```bash
curl -fsS https://YOUR_DOMAIN/api/health
curl -fsS https://YOUR_DOMAIN/api/products >/dev/null
curl -fsS https://YOUR_DOMAIN/api/storefront-settings >/dev/null
```

While maintenance mode is on, confirm the storefront shows maintenance and an
order attempt is rejected with HTTP 503. Test admin login, service health, and the
changed non-checkout feature. Then disable maintenance mode and immediately run a
controlled checkout, inventory movement, Thank You, and Pancake sync test. If any
post-maintenance check fails, turn maintenance mode back on and roll back.

## 23. Roll Back Safely

### 23.1 Prefer a code rollback first

Find the recorded pre-deploy SHA:

```bash
cat /var/backups/mariaclara/predeploy-git-YYYYMMDDTHHMMSSZ.txt
git log --oneline -10
```

Check out the known-good commit without rewriting `main`:

```bash
git switch --detach PREVIOUS_GOOD_COMMIT_SHA
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml config --quiet
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build --remove-orphans
```

Run the full smoke test. Keep production detached only during the incident. Fix or
revert the bad change through `codex-edits`, merge it into `main`, then return:

```bash
git switch main
git pull --ff-only origin main
docker compose --env-file deploy/production.env \
  -f deploy/docker-compose.production.yml up -d --build --remove-orphans
```

Do not force-push or `git reset --hard` on the VPS.

### 23.2 Database restore is a last resort

Code rollback does not reverse database migrations. Restore an old database only
when the database/schema is actually corrupted or incompatible. A restore deletes
every order placed after the selected backup.

Before restoring:

1. Enable application maintenance mode if the API is still available.
2. Preserve a fresh dump of the broken/current database.
3. Record the exact backup timestamp and approval.
4. Put Caddy behind an operator-only maintenance gate. An old database restore can
   restore `maintenanceMode=false`, so the database setting alone is insufficient.

For the documented DNS-only topology, save the live Caddyfile and temporarily
allow only the operator's current public IP:

```bash
sudo cp -p /etc/caddy/Caddyfile /etc/caddy/Caddyfile.pre-restore
sudo nano /etc/caddy/Caddyfile
```

```caddyfile
YOUR_DOMAIN, www.YOUR_DOMAIN {
  @operator remote_ip YOUR_CURRENT_PUBLIC_IP

  handle @operator {
    reverse_proxy 127.0.0.1:8081
  }

  handle {
    respond "Maintenance in progress" 503
  }
}
```

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Confirm a different connection receives HTTP 503. If Cloudflare proxying is later
enabled, adapt the matcher to the verified trusted-client-IP configuration or use
the VPS/provider firewall as the traffic gate.

Example destructive restore:

```bash
cd /var/www/mariaclara
BACKUP=/var/backups/mariaclara/database-YYYYMMDDTHHMMSSZ.dump

(
  set -Eeuo pipefail
  COMPOSE=(docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml)

  "${COMPOSE[@]}" stop web api
  "${COMPOSE[@]}" exec -T postgres sh -ec \
    'dropdb --force --if-exists -U "$POSTGRES_USER" "$POSTGRES_DB"; \
     createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  "${COMPOSE[@]}" exec -T postgres sh -ec \
    'pg_restore --exit-on-error --no-owner --no-acl -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
    < "$BACKUP"
  "${COMPOSE[@]}" up -d api web
  curl -fsS http://127.0.0.1:8081/api/health
  curl -fsS http://127.0.0.1:8081/api/products >/dev/null
)
```

From the allowed operator IP, re-run admin login, checkout, inventory, and Pancake
tests through the HTTPS domain. Keep the maintenance Caddyfile in place if any
check fails. Restore uploads only when necessary and only from the matching archive.

Only after all checks pass, reopen traffic:

```bash
sudo mv /etc/caddy/Caddyfile.pre-restore /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 24. Deployment Safety Rules

- Back up database, uploads, and the Git SHA before every production update.
- Keep verified off-server backups; same-VPS backups are not disaster recovery.
- Keep `.env`, `deploy/production.env`, and backups out of Git and `chmod 600` or
  stricter.
- Never expose Pancake, Meta, Semaphore, Resend, database, or admin secrets to the
  browser.
- Never use `admin` or another default/reused production password.
- Use `git pull --ff-only` on the VPS; do not develop there.
- Run `docker compose ... config --quiet` before every release.
- Check container state and recent logs after every release.
- Test checkout, Thank You, order persistence, and stock after every release.
- Test Pancake export, inbound polling, and inventory after every commerce change.
- Use maintenance mode for schema, checkout, inventory, or integration changes.
- Keep Pancake disabled during an incident by setting its mode to `disabled` or
  auto sync to `false`, then recreating the API.
- Keep J&T in `dry_run` until an official supported live integration is implemented.
- Apply Ubuntu/Docker security updates on a planned schedule and test after reboot.
- Monitor disk usage with `df -h` and `docker system df`; database, uploads, images,
  and backups all grow.
- Never run `docker compose down -v`, `docker volume prune`, or
  `docker system prune --volumes` in production. Those can delete customer data.

## 25. Final Go-Live Checklist

### Code and infrastructure

- [ ] `main` contains the approved release and GitHub CI is green.
- [ ] `npm test` passes.
- [ ] `node --test apps/web/test/*.test.js` passes.
- [ ] `npm run build:web` passes with no build errors.
- [ ] Production Compose config validation passes.
- [ ] `postgres`, `api`, and `web` are running; required health checks are green.
- [ ] Docker logs have no repeated errors or restart loops.
- [ ] Database, product uploads, and private issue screenshot backups exist, verify successfully, and have off-server copies.
- [ ] A restore drill has succeeded.

### Domain and security

- [ ] Cloudflare nameservers and DNS records resolve correctly.
- [ ] `https://YOUR_DOMAIN` and `https://www.YOUR_DOMAIN` work.
- [ ] The certificate is valid and HTTP redirects to HTTPS.
- [ ] PostgreSQL, API port 3000, and web port 8081 are not public.
- [ ] Production env permissions are `600` and no secret is committed.
- [ ] Admin password is long, unique, stored safely, and is not `admin`.
- [ ] Browser console has no errors, failed requests, or mixed-content warnings.
- [ ] Maintenance mode is OFF and storefront/cart/checkout are reachable.

### Customer website

- [ ] Homepage and product listing work.
- [ ] Product pages, images, variants, and size selection work.
- [ ] Size Chart works and its external/local image is available.
- [ ] Cart add, remove, quantity, totals, and persistence work.
- [ ] Stock quantity cannot exceed the selected variant's inventory.
- [ ] Checkout validation and COD order placement work.
- [ ] Checkout V2 rejects a disabled or unrecognized payment method server-side.
- [ ] Any enabled GCash/bank instructions and manual verification process are correct.
- [ ] Thank You page shows the correct private order details.
- [ ] Customer login/register/account work over HTTPS if enabled for launch.
- [ ] Google and Facebook buttons appear only for configured/enabled providers;
  each real OAuth login returns to the intended customer page and reuses a
  matching email account.
- [ ] No customer page shows Pancake status, counts, IDs, mappings, or other POS
  diagnostics.
- [ ] Mobile layouts work at common phone widths with no overlap/overflow.
- [ ] Report Issue works from a normal storefront page, appears in admin, and its
  status/admin note can be saved.
- [ ] Issue screenshots open only while logged into admin and are deleted with their reports.
- [ ] FAQ, Shipping & Returns, Terms, Contact, and Size Chart work.
- [ ] Messenger, Facebook, Instagram, TikTok, email, and phone links are correct.
- [ ] Every Instagram link opens `https://www.instagram.com/mariaclaraclothingshop/`.

### Admin, orders, and inventory

- [ ] Admin login/logout and the replacement password work over HTTPS.
- [ ] Dashboard, Orders, Products, Inventory, Customers, Discounts, Banners,
  Settings, Issue Reports, and Pancake pages work.
- [ ] One setting edit persists after refresh.
- [ ] One upload persists after an API/container restart.
- [ ] A real test order is present in PostgreSQL and admin.
- [ ] Checkout deducts exactly the ordered SKU quantity once.
- [ ] Concurrent/over-stock checkout is rejected rather than oversold.
- [ ] Cancellation and manual order-item inventory procedures are understood.

### Pancake POS

- [ ] Production API key, shop, warehouse, and order source are correct.
- [ ] Connection status is `connected`.
- [ ] Catalog import is complete in `read_only` mode.
- [ ] Mapping coverage is complete, price unit is `confirmed_pesos`, and conflicts are zero.
- [ ] Inventory reconciliation matches representative SKUs.
- [ ] Shadow order build completes without blocked/failed rows.
- [ ] The selected Pancake warehouse is the agreed inventory source of truth.
- [ ] The recreated API is actually running `PANCAKE_MODE=live` with
  `PANCAKE_AUTO_SYNC_ENABLED=true`.
- [ ] Stage C uses a new order, not a prior `shadow_built` row, and creates exactly
  one Pancake order.
- [ ] At least one full live worker cycle completes without repeated errors.
- [ ] Pancake status/tracking changes arrive in admin through the webhook (and
  also recover through polling if the webhook is temporarily unavailable).
- [ ] Admin changes for a linked order reach Pancake.
- [ ] Queued, failed, and blocked sync counts are zero or explained.

Complete the checklist locally or in staging first. In production, verify the
maintenance response, disable maintenance for the controlled checkout/Pancake
checks, and re-enable it immediately if an applicable check fails. Do not announce
launch until every applicable item is checked.

## 26. Command Reference

Set a short shell variable on the VPS to reduce typing in one terminal session:

```bash
cd /var/www/mariaclara
COMPOSE="docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml"
```

Use it as follows:

```bash
$COMPOSE config --quiet
$COMPOSE ps
$COMPOSE logs --tail=200
$COMPOSE logs -f --tail=100 api
$COMPOSE up -d --build --remove-orphans
$COMPOSE restart api                         # restart only; does not reload env
$COMPOSE up -d --force-recreate api          # reload changed API env
$COMPOSE restart web                         # refresh nginx after API recreation
$COMPOSE exec -T postgres pg_isready
```

After any API environment edit, use `up -d --force-recreate api`, restart web, and
check `/api/health`. A plain `restart api` reuses the old container environment.

Stopping containers without `-v` preserves named volumes, but causes downtime:

```bash
$COMPOSE down
$COMPOSE up -d
```

Never add `-v` to the production `down` command.
