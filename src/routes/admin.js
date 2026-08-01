const express = require("express");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
router.use(requireAuth, requireRole("admin"));

// GET /api/admin/stats
router.get("/stats", (req, res) => {
  const gmv = db.prepare(`SELECT COALESCE(SUM(total_cents),0) as c FROM orders WHERE created_at >= datetime('now','-30 days')`).get();
  const activeUsers = db.prepare(`SELECT COUNT(*) as c FROM users`).get();
  const sellers = db.prepare(`SELECT COUNT(*) as c FROM seller_profiles WHERE status = 'approved'`).get();
  const pending = db.prepare(`SELECT COUNT(*) as c FROM seller_profiles WHERE status = 'pending'`).get();
  const flagged = db.prepare(`SELECT COUNT(*) as c FROM products WHERE status = 'flagged'`).get();

  res.json({
    gmvCents30d: gmv.c,
    activeUsers: activeUsers.c,
    approvedSellers: sellers.c,
    pendingSellerApprovals: pending.c,
    flaggedProducts: flagged.c,
  });
});

// GET /api/admin/sellers?status=pending
router.get("/sellers", (req, res) => {
  const { status } = req.query;
  const sql = status
    ? `SELECT sp.*, u.name as owner_name, u.email FROM seller_profiles sp JOIN users u ON u.id = sp.user_id WHERE sp.status = ?`
    : `SELECT sp.*, u.name as owner_name, u.email FROM seller_profiles sp JOIN users u ON u.id = sp.user_id`;
  res.json(status ? db.prepare(sql).all(status) : db.prepare(sql).all());
});

// PATCH /api/admin/sellers/:id
router.patch("/sellers/:id", (req, res) => {
  const { status } = req.body;
  if (!["approved", "rejected", "suspended", "pending"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  const seller = db.prepare("SELECT * FROM seller_profiles WHERE id = ?").get(req.params.id);
  if (!seller) return res.status(404).json({ error: "Seller not found" });

  db.prepare("UPDATE seller_profiles SET status = ? WHERE id = ?").run(status, seller.id);
  res.json({ ok: true });
});

// GET /api/admin/users
router.get("/users", (req, res) => {
  res.json(db.prepare("SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC").all());
});

// PATCH /api/admin/users/:id
router.patch("/users/:id", (req, res) => {
  const { role } = req.body;
  if (!["buyer", "seller", "admin"].includes(role)) return res.status(400).json({ error: "Invalid role" });
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/products?status=flagged
router.get("/products", (req, res) => {
  const { status } = req.query;
  const sql = status
    ? `SELECT p.*, sp.store_name FROM products p JOIN seller_profiles sp ON sp.id = p.seller_id WHERE p.status = ?`
    : `SELECT p.*, sp.store_name FROM products p JOIN seller_profiles sp ON sp.id = p.seller_id`;
  const rows = (status ? db.prepare(sql).all(status) : db.prepare(sql).all()).map((p) => ({
    ...p,
    images: JSON.parse(p.images || "[]"),
  }));
  res.json(rows);
});

// PATCH /api/admin/products/:id
router.patch("/products/:id", (req, res) => {
  const { status } = req.body;
  if (!["active", "flagged", "removed"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  db.prepare("UPDATE products SET status = ? WHERE id = ?").run(status, req.params.id);
  res.json({ ok: true });
});

// GET /api/admin/transactions
router.get("/transactions", (req, res) => {
  const rows = db
    .prepare(
      `SELECT pay.id, pay.amount_cents, pay.method, pay.status, pay.created_at, o.id as order_id, u.name as buyer_name
       FROM payments pay
       JOIN orders o ON o.id = pay.order_id
       JOIN users u ON u.id = o.buyer_id
       ORDER BY pay.created_at DESC LIMIT 200`
    )
    .all();
  res.json(rows);
});

module.exports = router;
