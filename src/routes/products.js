const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

function withVariantsAndRating(product) {
  const variants = db.prepare("SELECT * FROM product_variants WHERE product_id = ?").all(product.id);
  const stats = db
    .prepare("SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews WHERE product_id = ?")
    .get(product.id);
  return {
    ...product,
    images: JSON.parse(product.images || "[]"),
    variants,
    stock: variants.reduce((sum, v) => sum + v.stock, 0),
    rating: stats.avgRating ? Math.round(stats.avgRating * 10) / 10 : null,
    reviewCount: stats.count,
  };
}

// GET /api/products?category=&minPrice=&maxPrice=&minRating=&brand=&q=&sort=
router.get("/", (req, res) => {
  const { category, minPrice, maxPrice, minRating, brand, q, sort } = req.query;

  let sql = `SELECT p.*, sp.store_name as seller_name FROM products p
              JOIN seller_profiles sp ON sp.id = p.seller_id WHERE p.status = 'active'`;
  const params = [];

  if (category) { sql += " AND p.category_id = ?"; params.push(category); }
  if (brand) { sql += " AND p.brand = ?"; params.push(brand); }
  if (minPrice) { sql += " AND p.price_cents >= ?"; params.push(Number(minPrice) * 100); }
  if (maxPrice) { sql += " AND p.price_cents <= ?"; params.push(Number(maxPrice) * 100); }
  if (q) { sql += " AND (p.name LIKE ? OR p.brand LIKE ?)"; params.push(`%${q}%`, `%${q}%`); }

  if (sort === "price-asc") sql += " ORDER BY p.price_cents ASC";
  else if (sort === "price-desc") sql += " ORDER BY p.price_cents DESC";
  else sql += " ORDER BY p.created_at DESC";

  let products = db.prepare(sql).all(...params).map(withVariantsAndRating);

  if (minRating) products = products.filter((p) => (p.rating || 0) >= Number(minRating));

  res.json(products);
});

// GET /api/products/:id
router.get("/:id", (req, res) => {
  const product = db
    .prepare(`SELECT p.*, sp.store_name as seller_name FROM products p JOIN seller_profiles sp ON sp.id = p.seller_id WHERE p.id = ?`)
    .get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(withVariantsAndRating(product));
});

// GET /api/products/:id/reviews
router.get("/:id/reviews", (req, res) => {
  const reviews = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.created_at, u.name as buyer_name
       FROM reviews r JOIN users u ON u.id = r.buyer_id
       WHERE r.product_id = ? ORDER BY r.created_at DESC`
    )
    .all(req.params.id);
  res.json(reviews);
});

// POST /api/products/:id/reviews  { rating, text }
router.post("/:id/reviews", requireAuth, (req, res) => {
  const { rating, text } = req.body;
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "rating must be 1-5" });

  const product = db.prepare("SELECT id FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const id = uuid();
  db.prepare("INSERT INTO reviews (id, product_id, buyer_id, rating, text) VALUES (?, ?, ?, ?, ?)")
    .run(id, req.params.id, req.user.id, rating, text || null);
  res.status(201).json({ id, rating, text });
});

module.exports = router;
