const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("seller"));

function getSellerProfile(userId) {
  return db.prepare("SELECT * FROM seller_profiles WHERE user_id = ?").get(userId);
}

function requireApprovedSeller(req, res, next) {
  const seller = getSellerProfile(req.user.id);
  if (!seller) return res.status(404).json({ error: "Seller profile not found" });
  if (seller.status !== "approved") {
    return res.status(403).json({ error: `Your seller account is ${seller.status}. Listings are disabled until an admin approves you.` });
  }
  req.seller = seller;
  next();
}

// GET /api/seller/me
router.get("/me", (req, res) => {
  const seller = getSellerProfile(req.user.id);
  if (!seller) return res.status(404).json({ error: "Seller profile not found" });

  const salesStats = db
    .prepare(
      `SELECT COALESCE(SUM(oi.quantity * oi.price_at_purchase_cents), 0) as revenue_cents, COUNT(DISTINCT oi.order_id) as order_count
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE oi.seller_id = ? AND o.created_at >= datetime('now', '-30 days')`
    )
    .get(seller.id);

  const ratingStats = db
    .prepare(
      `SELECT AVG(r.rating) as avg_rating FROM reviews r JOIN products p ON p.id = r.product_id WHERE p.seller_id = ?`
    )
    .get(seller.id);

  const listingCount = db.prepare("SELECT COUNT(*) as c FROM products WHERE seller_id = ? AND status = 'active'").get(seller.id);

  res.json({
    ...seller,
    stats: {
      revenueCents: salesStats.revenue_cents,
      orders30d: salesStats.order_count,
      avgRating: ratingStats.avg_rating ? Math.round(ratingStats.avg_rating * 10) / 10 : null,
      activeListings: listingCount.c,
    },
  });
});

// GET /api/seller/products
router.get("/products", requireApprovedSeller, (req, res) => {
  const products = db.prepare("SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC").all(req.seller.id);
  const withVariants = products.map((p) => ({
    ...p,
    images: JSON.parse(p.images || "[]"),
    variants: db.prepare("SELECT * FROM product_variants WHERE product_id = ?").all(p.id),
  }));
  res.json(withVariants);
});

// POST /api/seller/products
router.post("/products", requireApprovedSeller, (req, res) => {
  const { categoryId, name, brand, description, priceCents, images = [], variants } = req.body;
  if (!categoryId || !name || !priceCents || !variants?.length) {
    return res.status(400).json({ error: "categoryId, name, priceCents and at least one variant are required" });
  }

  const id = uuid();
  const createProduct = db.transaction(() => {
    db.prepare(
      `INSERT INTO products (id, seller_id, category_id, name, brand, description, price_cents, images)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, req.seller.id, categoryId, name, brand || null, description || null, priceCents, JSON.stringify(images));

    for (const v of variants) {
      db.prepare(
        `INSERT INTO product_variants (id, product_id, size, color, stock, sku) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(uuid(), id, v.size || null, v.color || null, v.stock || 0, v.sku || null);
    }
  });
  createProduct();

  res.status(201).json({ id });
});

// PATCH /api/seller/products/:id
router.patch("/products/:id", requireApprovedSeller, (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ? AND seller_id = ?").get(req.params.id, req.seller.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  const { name, description, priceCents, status } = req.body;
  db.prepare(
    `UPDATE products SET name = COALESCE(?, name), description = COALESCE(?, description),
     price_cents = COALESCE(?, price_cents), status = COALESCE(?, status) WHERE id = ?`
  ).run(name, description, priceCents, status, product.id);

  res.json({ ok: true });
});

// PATCH /api/seller/products/:productId/variants/:variantId
router.patch("/products/:productId/variants/:variantId", requireApprovedSeller, (req, res) => {
  const { stock } = req.body;
  const product = db.prepare("SELECT id FROM products WHERE id = ? AND seller_id = ?").get(req.params.productId, req.seller.id);
  if (!product) return res.status(404).json({ error: "Product not found" });

  db.prepare("UPDATE product_variants SET stock = ? WHERE id = ? AND product_id = ?")
    .run(stock, req.params.variantId, req.params.productId);
  res.json({ ok: true });
});

// GET /api/seller/orders
router.get("/orders", requireApprovedSeller, (req, res) => {
  const orders = db
    .prepare(
      `SELECT DISTINCT o.id, o.status, o.created_at, o.shipping_address
       FROM orders o JOIN order_items oi ON oi.order_id = o.id
       WHERE oi.seller_id = ? ORDER BY o.created_at DESC`
    )
    .all(req.seller.id);

  const withItems = orders.map((o) => ({
    ...o,
    shipping_address: JSON.parse(o.shipping_address),
    items: db
      .prepare(`SELECT oi.*, p.name FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? AND oi.seller_id = ?`)
      .all(o.id, req.seller.id),
  }));
  res.json(withItems);
});

// PATCH /api/seller/orders/:orderId/status
router.patch("/orders/:orderId/status", requireApprovedSeller, (req, res) => {
  const { status } = req.body;
  if (!["processing", "shipped", "delivered"].includes(status)) {
    return res.status(400).json({ error: "status must be processing, shipped, or delivered" });
  }

  const owns = db
    .prepare("SELECT 1 FROM order_items WHERE order_id = ? AND seller_id = ?")
    .get(req.params.orderId, req.seller.id);
  if (!owns) return res.status(404).json({ error: "Order not found" });

  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, req.params.orderId);
  res.json({ ok: true });
});

module.exports = router;
