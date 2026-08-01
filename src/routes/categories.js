const express = require("express");
const db = require("../db");
const router = express.Router();

// GET /api/categories
router.get("/", (req, res) => {
  res.json(db.prepare("SELECT * FROM categories").all());
});

module.exports = router;
