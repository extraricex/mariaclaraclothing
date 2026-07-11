# Real World Deployment Step By Step

This guide is for putting the Maria Clara Clothing website online so customers can view products and place orders.

## 1. Buy A VPS

Recommended budget setup:

- Provider: Hostinger VPS, Hetzner Cloud, or DigitalOcean
- OS: Ubuntu 24.04 LTS Server
- Minimum: 2GB RAM, 1 vCPU, 40GB storage
- Better budget target: 4GB RAM, 1-2 vCPU, 50GB storage

Do not choose Ubuntu Desktop or Ubuntu on WSL. For a real 24/7 online website, choose Ubuntu Server.

After creating the VPS, save:

- VPS IP address
- Root username
- Root password or SSH key access

## 2. Prepare A Domain

You need a domain such as:

```text
mariaclaraclothing.com
```

Recommended DNS provider:

- Cloudflare Free

You will point the domain to the VPS IP later.

## 3. Connect To The VPS

From your computer terminal:

```bash
ssh root@YOUR_VPS_IP
```

Replace `YOUR_VPS_IP` with the VPS IP from your provider.

## 4. Install Docker

Run these commands on the VPS:

```bash
apt update
apt upgrade -y
apt install -y ca-certificates curl gnupg git nano openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo ${UBUNTU_CODENAME:-$VERSION_CODENAME}) stable" > /etc/apt/sources.list.d/docker.list
apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Check Docker:

```bash
docker --version
docker compose version
```

## 5. Download The Website Code

Run on the VPS:

```bash
cd /opt
git clone -b codex-edits https://github.com/extraricex/mariaclaraclothing.git
cd mariaclaraclothing
```

## 6. Create Production Environment File

Copy the template:

```bash
cp deploy/production.env.example deploy/production.env
nano deploy/production.env
```

Fill in the required values.

Important values:

```env
POSTGRES_PASSWORD=replace-with-strong-password
DATABASE_URL=postgres://postgres:replace-with-strong-password@postgres:5432/maria_clara
ADMIN_TOKEN=replace-with-random-secret
ADMIN_PASSWORD=replace-with-strong-admin-password
CUSTOMER_AUTH_SECRET=replace-with-random-secret
ORDER_CONFIRMATION_SECRET=replace-with-random-secret
PANCAKE_API_KEY=replace-with-pancake-api-key
```

Generate random secrets:

```bash
openssl rand -hex 32
```

Use a different generated value for each secret.

Do not commit `deploy/production.env` to GitHub.

## 7. Start The Production Stack

Run:

```bash
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml up -d --build
```

Check containers:

```bash
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml ps
```

Check API health:

```bash
curl http://127.0.0.1/api/health
```

Expected result:

```json
{"ok":true,"service":"maria-clara-clothing"}
```

## 8. Point Domain To VPS

In Cloudflare DNS, add:

```text
Type: A
Name: @
Content: YOUR_VPS_IP
Proxy: ON
```

Optional `www`:

```text
Type: CNAME
Name: www
Content: yourdomain.com
Proxy: ON
```

## 9. Enable HTTPS

In Cloudflare:

- SSL/TLS mode: Full
- Always Use HTTPS: ON
- Proxy status: ON

HTTPS is required because production login/session cookies need secure browser connections.

## 10. Test The Public Website

Open:

```text
https://yourdomain.com
```

Test this flow:

1. Homepage loads.
2. Product page loads.
3. Add product to cart.
4. Checkout with Cash on Delivery.
5. Thank-you page opens.
6. Admin login works.
7. Order appears in admin.
8. Order appears in Pancake POS.
9. Product photos are visible.
10. Stock/inventory behavior is correct.

## 11. Backups

Before accepting real customer orders, make at least one database backup:

```bash
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' > backup.sql
```

Back up uploads:

```bash
docker run --rm -v maria_clara_uploads:/uploads -v "$PWD":/backup alpine tar czf /backup/uploads-backup.tgz /uploads
```

Store backups away from the VPS when possible.

## 12. Update The Website Later

When new code is pushed to GitHub:

```bash
cd /opt/mariaclaraclothing
git pull origin codex-edits
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml up -d --build
```

Then check:

```bash
docker compose --env-file deploy/production.env -f deploy/docker-compose.production.yml ps
curl http://127.0.0.1/api/health
```

## What To Send Before We Deploy

Send these details:

- VPS IP address
- Domain name
- VPS provider
- Confirmation that OS is Ubuntu 24.04 LTS Server

Then we can deploy command by command.
