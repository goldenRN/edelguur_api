
const express = require("express");
const pool = require("../db");
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Cloudinary тохиргоо
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});


const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "edelguur/banner", // Cloudinary доторх хавтасны нэр
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

// ✅ 1. Баннер нэмэх
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const {  description } = req.body;
    const image_url = req.file ? req.file.path : null; // Cloudinary URL автоматаар үүснэ

    const result = await pool.query(
      `INSERT INTO banners ( description, image_url)
       VALUES ($1, $2)
       RETURNING *`,
      [ description, image_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Баннер нэмэхэд алдаа:", err);
    res.status(500).json({ message: "Баннер нэмэхэд алдаа гарлаа", error: err });
  }
});

// ✅ 2. Бүх data авах
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * from banners
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Баннер авахад алдаа:", err);
    res.status(500).json({ error: "Database query failed", details: err });
  }
});

// ✅ 3. banner засах
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  const client = await pool.connect();
  try {
    const {  description } = req.body;
    const id = req.params.id;

    const oldBanner = await client.query("SELECT * FROM banners WHERE id=$1", [id]);
    if (oldBanner.rows.length === 0) {
      return res.status(404).json({ message: "баннер олдсонгүй" });
    }

    let image_url = oldBanner.rows[0].image_url;

    // Cloudinary дээр шинэ зураг ирсэн бол шинэ URL-г авна
    if (req.file) {
      image_url = req.file.path;
    }

    await client.query("BEGIN");

    const updatedBanner = await client.query(
      `UPDATE banners 
       SET description=$1, image_url=$2 
       WHERE id=$3 
       RETURNING *`,
      [ description, image_url, id]
    );


    res.json(updatedBanner.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Баннер засахад алдаа:", err);
    res.status(500).json({ message: "Баннер засахад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});


// ✅ 4. баннер устгах
router.delete("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const bannerId = req.params.id;
  
    await client.query("DELETE FROM banners WHERE id=$1", [bannerId]);
    res.json({ message: "banner амжилттай устгагдлаа" });
  } catch (err) {
    console.error("❌ Устгах явцад алдаа гарлаа:", err);
    res.status(500).json({ message: "Устгах явцад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});

module.exports = router;