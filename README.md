# Maria Clara Clothing Webstore

Node/Express storefront and admin workspace for Maria Clara Clothing.

## Setup

```bash
npm install
cp .env.example .env
npm start
```

Local app:

- Customer website: `http://localhost:3100/`
- Admin website: `http://localhost:3100/admin-login.html`

## Environment

Required for admin access:

- `ADMIN_TOKEN`
- `PANCAKE_WEBHOOK_SECRET`

Optional for PostgreSQL persistence:

- `DATABASE_URL`

The `.env` file is ignored and must not be uploaded to GitHub. Keep only `.env.example` in the repository.

## Commands

```bash
npm test
npm run audit:product-images
npm run jnt:address-guide
npm run db:migrate
npm run db:seed
```

## Product Data And Images

`data/products.json` is the seed/backup catalog. When `DATABASE_URL` is enabled, product records, variants, and image records are stored in PostgreSQL tables, including `product_images`.

Product image cleanup rule:

- Remote CDN image URLs are safe because they are hosted outside this repo.
- Local URLs under `/uploads/products/` still need their physical files in `public/uploads/products/`.
- Run `npm run audit:product-images` before deleting local upload files.

## J&T Export

The J&T Excel export uses the template in:

```text
data/jnt/jntexportfile.xlsx
```

Do not delete files inside `data/jnt/` unless the export feature is changed and tested.

## GitHub Upload Checklist

Before uploading:

```bash
npm test
npm run audit:product-images
```

Do not upload:

- `.env`
- `node_modules/`
- `.playwright-profile/`
- `.superpowers/`
- `.DS_Store`
- generated root screenshot PNG files
