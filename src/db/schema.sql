-- Oscar Gold Store — core schema
-- SQLite dialect. Types map 1:1 onto Postgres if you outgrow SQLite later.

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'buyer' CHECK (role IN ('buyer','seller','admin')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS seller_profiles (
  id             TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL UNIQUE REFERENCES users(id),
  store_name     TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','suspended')),
  payout_details TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS addresses (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  label       TEXT,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  line1       TEXT NOT NULL,
  city        TEXT NOT NULL,
  postal_code TEXT NOT NULL,
  country     TEXT NOT NULL DEFAULT 'US',
  is_default  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id   TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES seller_profiles(id),
  category_id  TEXT NOT NULL REFERENCES categories(id),
  name         TEXT NOT NULL,
  brand        TEXT,
  description  TEXT,
  price_cents  INTEGER NOT NULL,
  images       TEXT NOT NULL DEFAULT '[]',
  status       TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','flagged','removed')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_variants (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  size       TEXT,
  color      TEXT,
  stock      INTEGER NOT NULL DEFAULT 0,
  sku        TEXT UNIQUE
);

CREATE TABLE IF NOT EXISTS reviews (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  buyer_id   TEXT NOT NULL REFERENCES users(id),
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  text       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  variant_id TEXT NOT NULL REFERENCES product_variants(id),
  quantity   INTEGER NOT NULL DEFAULT 1,
  saved_for_later INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id                TEXT PRIMARY KEY,
  buyer_id          TEXT NOT NULL REFERENCES users(id),
  status            TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','shipped','delivered','cancelled')),
  shipping_address  TEXT NOT NULL,
  shipping_method   TEXT,
  subtotal_cents    INTEGER NOT NULL,
  shipping_cents    INTEGER NOT NULL DEFAULT 0,
  total_cents       INTEGER NOT NULL,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id                  TEXT PRIMARY KEY,
  order_id            TEXT NOT NULL REFERENCES orders(id),
  product_id          TEXT NOT NULL REFERENCES products(id),
  variant_id          TEXT NOT NULL REFERENCES product_variants(id),
  seller_id           TEXT NOT NULL REFERENCES seller_profiles(id),
  quantity            INTEGER NOT NULL,
  price_at_purchase_cents INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payments (
  id                TEXT PRIMARY KEY,
  order_id          TEXT NOT NULL REFERENCES orders(id),
  amount_cents      INTEGER NOT NULL,
  method            TEXT NOT NULL CHECK (method IN ('card','bank','mobile')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','succeeded','failed','refunded')),
  stripe_payment_id TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coupons (
  code            TEXT PRIMARY KEY,
  percent_off     INTEGER,
  amount_off_cents INTEGER,
  expires_at      TEXT,
  max_uses        INTEGER,
  times_used      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_cart_user ON cart_items(user_id);
