const express = require("express");
const { v4: uuid } = require("uuid");
const db = require("../db");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth);

// POST /api/orders/checkout
router.post("/checkout", (req, res) => {
  const { address, shippingMethod, shippingCents = 0, paymentMethod } = req.body;
  if (!address || !address.line1) return res.status(400).json({ error: "A delivery address is required" });
  if (!["card", "bank", "mobile"].includes(paymentMethod)) {
    return res.status(400).json({ error: "paymentMethod must be card, bank, or mobile" });
  }

  const cartItems = db
    .prepare(
      `SELECT ci.id as cart_item_id, ci.quantity, pv.id as variant_id, pv.stock, p.id as product_id,
              p.seller_id, p.price_cents
       FROM cart_items ci
       JOIN product_variants pv ON pv.id = ci.variant_id
       JOIN products p ON p.id = pv.product_id
       WHERE ci.user_id = ? AND ci.saved_for_later = 0`
    )
    .all(req.user.id);

  if (cartItems.length === 0) return res.status(400).json({ error: "Your cart is empty" });

  for (const item of cartItems) {
    if (item.stock < item.quantity) {
      return res.status(409).json({ error: `Not enough stock for one of the items in your cart` });
    }
  }

  const subtotalCents = cartItems.reduce((s, i) => s + i.price_cents * i.quantity, 0);
  const totalCents = subtotalCents + shippingCents;
  const orderId = uuid();

  const runCheckout = db.transaction(() => {
    db.prepare(
      `INSERT INTO orders (id, buyer_id, status, shipping_address, shipping_method, subtotal_cents, shipping_cents, total_cents)
       VALUES (?, ?, 'processing', ?, ?, ?, ?, ?)`
    ).run(orderId, req.user.id, JSON.stringify(address), shippingMethod || "Standard", subtotalCents, shippingCents, totalCents);

    for (const item of cartItems) {
      db.prepare(
        `INSERT INTO order_items (id, order_id, product_id, variant_id, seller_id, quantity, price_at_purchase_cents)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(uuid(), orderId, item.product_id, item.variant_id, item.seller_id, item.quantity, item.price_cents);

      db.prepare("UPDATE product_variants SET stock = stock - ? WHERE id = ?").run(item.quantity, item.variant_id);
      db.prepare("DELETE FROM cart_items WHERE id = ?").run(item.cart_item_id);
    }

    const paymentId = uuid();
    db.prepare(
      `INSERT INTO payments (id, order_id, amount_cents, method, status) VALUES (?, ?, ?, ?, 'pending')`
    ).run(paymentId, orderId, totalCents, paymentMethod);

    return paymentId;
  });

  const paymentId = runCheckout();

  res.status(201).json({
    order: { id: orderId, status: "processing", totalCents },
    paymentId,
  });
});

// GET /api/orders
router.get("/", (req, res) => {
  const orders = db
    .prepare("SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC")
    .all(req.user.id)
    .map((o) => ({ ...o, shipping_address: JSON.parse(o.shipping_address) }));
  res.json(orders);
});

// GET /api/orders/:id
router.get("/:id", (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ?").get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: "Order not found" });

  const items = db
    .prepare(
      `SELECT oi.*, p.name, p.brand FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ?`
    )
    .all(order.id);

  res.json({ ...order, shipping_address: JSON.parse(order.shipping_address), items });
});

module.exports = router;
