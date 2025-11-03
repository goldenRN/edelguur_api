const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// 🧩 JWT хамгаалалт
const generateToken = (user) => {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
};

// =========================
// 🧠 1. Хэрэглэгч бүртгэх
// =========================
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Бүх талбаруудыг бөглөнө үү" });
    }

    // email давхар шалгах
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ message: "Ийм имэйл бүртгэлтэй байна" });
    }

    // нууц үг хашлах
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // DB-д хадгалах
    const newUser = await pool.query(
      "INSERT INTO users (name, email, password_hash, phone) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, email, hashedPassword, phone]
    );

    // JWT token үүсгэх
    const token = generateToken(newUser.rows[0]);

    res.status(201).json({
      message: "Бүртгэл амжилттай!",
      user: {
        id: newUser.rows[0].id,
        name: newUser.rows[0].name,
        email: newUser.rows[0].email,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Серверийн алдаа" });
  }
});

// =========================
// 🔐 2. Нэвтрэх (Login)
// =========================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Хэрэглэгч шалгах
    const userRes = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(400).json({ message: "Имэйл эсвэл нууц үг буруу" });
    }

    // Нууц үг шалгах
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: "Имэйл эсвэл нууц үг буруу" });
    }

    // Token буцаах
    const token = generateToken(user);
    res.json({
      message: "Амжилттай нэвтэрлээ",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
      token,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Серверийн алдаа" });
  }
});

// ✅ 3. Token шалгах middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Token байхгүй байна" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    return res.status(403).json({ message: "Token хүчингүй" });
  }
};
// =========================
// 👤 4. Хэрэглэгчийн мэдээлэл авах
// =========================
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const userRes = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [req.user.id]);
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ message: "Хэрэглэгч олдсонгүй" });

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: "Алдаа гарлаа" });
  }
});


module.exports = { router, authMiddleware };
