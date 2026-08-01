const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

function getCart(userId, savedForLater = 0) {
  return db
    .prepare(
      `SELECT ci.id, ci.quantity, ci.saved_for_later, pv.id as variant_id, pv.size, pv.color, pv.stock,
              p.id as product_id, p.name, p.brand, p.price_cents, p.images
       FROM cart_items ci
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE ci.user_id = ? AND ci.saved_for_later = ?`
    )
    .all(userId, savedForLater)
    .map((row) => ({ ...row, images: JSON.parse(row.images || "[]") }));
}

// GET /api/cart
router.get("/", (req, res) => {
  res.json({ items: getCart(req.user.id, 0), savedForLater: getCart(req.user.id, 1) });
});

// POST /api/cart  { variantId, quantity }
router.post("/", (req, res) => {
  const { variantId, quantity = 1 } = req.body;
  const variant = db.prepare("SELECT * FROM product_variants WHERE id = ?").get(variantId);
  if (!variant) return res.status(404).json({ error: "Product variant not found" });
  if (variant.stock < quantity) return res.status(400).json({ error: "Not enough stock available" });

  const existing = db
    .prepare("SELECT * FROM cart_items WHERE user_id = ? AND variant_id = ? AND saved_for_later = 0")
    .get(req.user.id, variantId);

  if (existing) {
    db.prepare("UPDATE cart_items SET quantity = quantity + ? WHERE id = ?").run(quantity, existing.id);
  } else {
    db.prepare("INSERT INTO cart_items (id, user_id, variant_id, quantity) VALUES (?, ?, ?, ?)")
      .run(uuid(), req.user.id, variantId, quantity);
  }
  res.status(201).json({ items: getCart(req.user.id, 0) });
});

// PATCH /api/cart/:itemId  { quantity } or { savedForLater: true/false }
router.patch("/:itemId", (req, res) => {
  const { quantity, savedForLater } = req.body;
  const item = db.prepare("SELECT * FROM cart_items WHERE id = ? AND user_id = ?").get(req.params.itemId, req.user.id);
  if (!item) return res.status(404).json({ error: "Cart item not found" });

  if (quantity !== undefined) db.prepare("UPDATE cart_items SET quantity = ? WHERE id = ?").run(quantity, item.id);
  if (savedForLater !== undefined)
    db.prepare("UPDATE cart_items SET saved_for_later = ? WHERE id = ?").run(savedForLater ? 1 : 0, item.id);

  res.json({ items: getCart(req.user.id, 0), savedForLater: getCart(req.user.id, 1) });
});

// DELETE /api/cart/:itemId
router.delete("/:itemId", (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE id = ? AND user_id = ?").run(req.params.itemId, req.user.id);
  res.status(204).end();
});

// GET /api/cart/wishlist/all
router.get("/wishlist/all", (req, res) => {
  const items = db
    .prepare(
      `SELECT p.* FROM wishlist_items w JOIN products p ON p.id = w.product_id WHERE w.user_id = ?`
    )
    .all(req.user.id);
  res.json(items.map((p) => ({ ...p, images: JSON.parse(p.images || "[]") })));
});

// POST /api/cart/wishlist/all  { productId }
router.post("/wishlist/all", (req, res) => {
  const { productId } = req.body;
  db.prepare("INSERT OR IGNORE INTO wishlist_items (id, user_id, product_id) VALUES (?, ?, ?)")
    .run(uuid(), req.user.id, productId);
  res.status(201).end();
});

// DELETE /api/cart/wishlist/:productId
router.delete("/wishlist/:productId", (req, res) => {
  db.prepare("DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?").run(req.user.id, req.params.productId);
  res.status(204).end();
});

module.exports = router;
