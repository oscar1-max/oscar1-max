require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const categoryRoutes = require("./routes/categories");
const productRoutes = require("./routes/products");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/orders");
const paymentRoutes = require("./routes/payments");
const sellerRoutes = require("./routes/seller");
const adminRoutes = require("./routes/admin");

// Fail fast with a clear message instead of a confusing crash later
if (!process.env.JWT_SECRET) {
  console.error("Missing JWT_SECRET in .env — copy .env.example to .env and fill it in.");
  process.exit(1);
}

const app = express();

// FIXED CORS - now allows localhost AND your netlify site
app.use(
  cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000,https://oscar-gold.netlify.app").split(","),
    credentials: true,
  })
);

// IMPORTANT: the Stripe webhook route needs the raw request body to verify its signature,
// so it must be mounted with express.raw() BEFORE the global express.json() parser below.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok", time: new Date().toISOString() }));

app.use("/api/auth", authRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/seller", sellerRoutes);
app.use("/api/admin", adminRoutes);

app.use((req, res) => res.status(404).json({ error: "Not found" }));

// Central error handler — catches anything thrown or passed to next(err) in the routes above
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || "Something went wrong" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Oscar Gold Store API running on http://localhost:${PORT}`);
});
