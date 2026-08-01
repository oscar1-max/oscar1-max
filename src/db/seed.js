// Populates the database with the same demo data used in the frontend prototype.
// Run once with: npm run seed

const { v4: uuid } = require("uuid");
const bcrypt = require("bcryptjs");
const db = require("./index");

const now = () => new Date().toISOString();

function upsertCategory(id, name) {
  db.prepare(`INSERT OR IGNORE INTO categories (id, name) VALUES (?, ?)`).run(id, name);
}

function createUser(name, email, password, role) {
  const existing = db.prepare(`SELECT id FROM users WHERE email = ?`).get(email);
  if (existing) return existing.id;
  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
    .run(id, name, email, hash, role);
  return id;
}

function createSeller(userId, storeName, status = "approved") {
  const existing = db.prepare(`SELECT id FROM seller_profiles WHERE user_id = ?`).get(userId);
  if (existing) return existing.id;
  const id = uuid();
  db.prepare(`INSERT INTO seller_profiles (id, user_id, store_name, status) VALUES (?, ?, ?, ?)`)
    .run(id, userId, storeName, status);
  return id;
}

function createProduct({ sellerId, categoryId, name, brand, description, priceCents, variants }) {
  const id = uuid();
  db.prepare(
    `INSERT INTO products (id, seller_id, category_id, name, brand, description, price_cents) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, sellerId, categoryId, name, brand, description, priceCents);

  for (const v of variants) {
    db.prepare(
      `INSERT INTO product_variants (id, product_id, size, color, stock, sku) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuid(), id, v.size || null, v.color || null, v.stock, `${name.slice(0, 3).toUpperCase()}-${uuid().slice(0, 6)}`);
  }
  return id;
}

console.log("Seeding categories...");
[
  ["electronics", "Electronics"],
  ["fashion", "Fashion"],
  ["beauty", "Beauty"],
  ["food", "Food"],
  ["home", "Home"],
  ["sports", "Sports"],
  ["accessories", "Accessories"],
].forEach(([id, name]) => upsertCategory(id, name));

console.log("Seeding users...");
const adminId = createUser("Site Admin", "admin@oscargold.store", "AdminPass123!", "admin");
const buyerId = createUser("Amara O.", "amara@example.com", "BuyerPass123!", "buyer");
const sellerUserId = createUser("Maison Rho", "seller@maisonrho.com", "SellerPass123!", "seller");

console.log("Seeding seller profile...");
const sellerId = createSeller(sellerUserId, "Maison Rho Atelier");

console.log("Seeding products...");
createProduct({
  sellerId,
  categoryId: "fashion",
  name: "Velvet Tailored Blazer",
  brand: "Maison Rho",
  description: "A structured blazer cut from Italian velvet, finished with horn buttons.",
  priceCents: 14500,
  variants: [
    { size: "S", color: "Black", stock: 4 },
    { size: "M", color: "Black", stock: 5 },
    { size: "M", color: "Ivory", stock: 3 },
  ],
});

createProduct({
  sellerId,
  categoryId: "fashion",
  name: "Signet Leather Wallet",
  brand: "Maison Rho",
  description: "Full-grain leather bifold wallet with a hand-stitched gold edge.",
  priceCents: 6400,
  variants: [
    { color: "Black", stock: 20 },
    { color: "Cognac", stock: 20 },
  ],
});

createProduct({
  sellerId,
  categoryId: "accessories",
  name: "Aureate Sunglasses",
  brand: "Maison Rho",
  description: "Polarized acetate sunglasses with 18k gold-plated hardware.",
  priceCents: 7800,
  variants: [
    { color: "Black/Gold", stock: 15 },
    { color: "Tortoise/Gold", stock: 15 },
  ],
});

console.log("Done. Demo accounts:");
console.log("  admin:  admin@oscargold.store  / AdminPass123!");
console.log("  buyer:  amara@example.com      / BuyerPass123!");
console.log("  seller: seller@maisonrho.com   / SellerPass123!");
