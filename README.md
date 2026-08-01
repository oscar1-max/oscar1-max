# Oscar Gold Store — Backend API

A real, runnable backend for the Oscar Gold Store marketplace: authentication, products,
cart, checkout, Stripe payments, a seller dashboard API, and an admin dashboard API.

Built with **Node.js + Express + SQLite** (via `better-sqlite3`) so you can run it locally
with zero external services — swap in Postgres later if you outgrow SQLite.

## 1. Install

```bash
npm install
cp .env.example .env
```

Open `.env` and fill in:
- `JWT_SECRET` — any long random string
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — from https://dashboard.stripe.com/test/apikeys

## 2. Seed demo data

```bash
npm run seed
```

Creates categories, a seller, a buyer, an admin, and a few products. Prints demo login
credentials when it finishes.

## 3. Run the server

```bash
npm start
npm run dev    # auto-restarts on file changes
```

API live at `http://localhost:4000`. Check `http://localhost:4000/health`.

## Demo accounts (after seeding)

| Role | Email | Password |
|---|---|---|
| Buyer | amara@example.com | BuyerPass123! |
| Seller | seller@maisonrho.com | SellerPass123! |
| Admin | admin@oscargold.store | AdminPass123! |

## Known simplifications

- One order can contain items from multiple sellers, but status is stored once per order.
- Product images are just a JSON array of URLs — add real file upload later if needed.
- SQLite is fine for development and low-medium traffic; move to Postgres for heavier scale.
- Seller payouts aren't implemented — use Stripe Connect for that in production.
