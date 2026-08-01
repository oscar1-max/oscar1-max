const express = require("express");
const Stripe = require("stripe");
const db = require("../db");
const { requireAuth, requireRole } = require("../middleware/auth");

const router = express.Router();
const stripe = process.env.STRIPE_SECRET_KEY ? Stripe(process.env.STRIPE_SECRET_KEY) : null;

// POST /api/payments/create-intent  { paymentId }
router.post("/create-intent", requireAuth, async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe is not configured — set STRIPE_SECRET_KEY in .env" });

  const { paymentId } = req.body;
  const payment = db
    .prepare(
      `SELECT p.*, o.buyer_id FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ?`
    )
    .get(paymentId);

  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.buyer_id !== req.user.id) return res.status(403).json({ error: "Not your order" });
  if (payment.method !== "card") return res.status(400).json({ error: "This payment is not a card payment" });
  if (payment.status !== "pending") return res.status(400).json({ error: `Payment already ${payment.status}` });

  try {
    const intent = await stripe.paymentIntents.create({
      amount: payment.amount_cents,
      currency: "usd",
      metadata: { paymentId: payment.id, orderId: payment.order_id },
      automatic_payment_methods: { enabled: true },
    });

    db.prepare("UPDATE payments SET stripe_payment_id = ? WHERE id = ?").run(intent.id, payment.id);
    res.json({ clientSecret: intent.client_secret });
  } catch (err) {
    res.status(502).json({ error: `Stripe error: ${err.message}` });
  }
});

// POST /api/payments/webhook
router.post("/webhook", async (req, res) => {
  if (!stripe) return res.status(500).end();

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers["stripe-signature"], process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).send(`Webhook signature verification failed: ${err.message}`);
  }

  if (event.type === "payment_intent.succeeded" || event.type === "payment_intent.payment_failed") {
    const intent = event.data.object;
    const status = event.type === "payment_intent.succeeded" ? "succeeded" : "failed";
    db.prepare("UPDATE payments SET status = ? WHERE stripe_payment_id = ?").run(status, intent.id);

    if (status === "failed") {
      const payment = db.prepare("SELECT * FROM payments WHERE stripe_payment_id = ?").get(intent.id);
      if (payment) {
        const items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(payment.order_id);
        const restock = db.transaction(() => {
          for (const item of items) {
            db.prepare("UPDATE product_variants SET stock = stock + ? WHERE id = ?").run(item.quantity, item.variant_id);
          }
          db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(payment.order_id);
        });
        restock();
      }
    }
  }

  res.json({ received: true });
});

// GET /api/payments/:id
router.get("/:id", requireAuth, (req, res) => {
  const payment = db
    .prepare(`SELECT p.* FROM payments p JOIN orders o ON o.id = p.order_id WHERE p.id = ? AND o.buyer_id = ?`)
    .get(req.params.id, req.user.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  res.json(payment);
});

// PATCH /api/payments/:id/confirm-manual
router.patch("/:id/confirm-manual", requireAuth, requireRole("admin"), (req, res) => {
  const { status } = req.body;
  if (!["succeeded", "failed"].includes(status)) return res.status(400).json({ error: "status must be succeeded or failed" });

  const payment = db.prepare("SELECT * FROM payments WHERE id = ?").get(req.params.id);
  if (!payment) return res.status(404).json({ error: "Payment not found" });
  if (payment.method === "card") return res.status(400).json({ error: "Card payments confirm automatically via Stripe" });

  db.prepare("UPDATE payments SET status = ? WHERE id = ?").run(status, payment.id);
  if (status === "failed") db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(payment.order_id);

  res.json({ id: payment.id, status });
});

module.exports = router;
