
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
    folder: "edelguur/categories", // Cloudinary доторх хавтасны нэр
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

// ✅ 1. Ангилал нэмэх
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const { name, description } = req.body;
    const image_url = req.file ? req.file.path : null; // Cloudinary URL автоматаар үүснэ

    const result = await pool.query(
      `INSERT INTO categories (name, description, image_url)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [name, description, image_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("❌ Ангилал нэмэхэд алдаа:", err);
    res.status(500).json({ message: "Ангилал нэмэхэд алдаа гарлаа", error: err });
  }
});

// ✅ 2. Бүх ангилал авах
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id AS category_id,
        c.name AS category_name,
        c.image_url AS category_image,
        COALESCE(
          json_agg(
            json_build_object(
              'id', s.id,
              'name', s.name
            )
          ) FILTER (WHERE s.id IS NOT NULL),
          '[]'
        ) AS subcategories
      FROM categories c
      LEFT JOIN sub_categories s ON s.category_id = c.id
      GROUP BY c.id, c.name, c.image_url
      ORDER BY c.id ASC;
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Бүх ангилал авахад алдаа:", err);
    res.status(500).json({ error: "Database query failed", details: err });
  }
});

// ✅ 3. Ангилал засах
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description } = req.body;
    const categoryId = req.params.id;

    const oldCategory = await client.query("SELECT * FROM categories WHERE id=$1", [categoryId]);
    if (oldCategory.rows.length === 0) {
      return res.status(404).json({ message: "Ангилал олдсонгүй" });
    }

    let image_url = oldCategory.rows[0].image_url;

    // Cloudinary дээр шинэ зураг ирсэн бол шинэ URL-г авна
    if (req.file) {
      image_url = req.file.path;
    }

    await client.query("BEGIN");

    const updatedCategory = await client.query(
      `UPDATE categories 
       SET name=$1, description=$2, image_url=$3 
       WHERE id=$4 
       RETURNING *`,
      [name, description, image_url, categoryId]
    );

    await client.query(
      `UPDATE products 
       SET category_name=$1 
       WHERE category_id=$2`,
      [name, categoryId]
    );

    await client.query("COMMIT");
    res.json(updatedCategory.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Ангилал засахад алдаа:", err);
    res.status(500).json({ message: "Ангилал засахад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});
// ✅ categoryRoutes.js (зөв хувилбар)
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1️⃣ Бүх категори жагсаалт
    const allCategories = await pool.query(`
      SELECT c.id AS category_id, c.name AS category_name, c.image_url AS category_image
      FROM categories c
    `);

    // 2️⃣ Тухайн category
    const categoryResult = await pool.query(
      `SELECT id AS category_id, name AS category_name, image_url AS category_image
       FROM categories WHERE id = $1`,
      [id]
    );

    if (categoryResult.rows.length === 0)
      return res.status(404).json({ message: "Category not found" });

    // 3️⃣ Category-ийн бүтээгдэхүүнүүд
    const productResult = await pool.query(
      `SELECT p.*, 
              COALESCE(json_agg(pi.*) FILTER (WHERE pi.id IS NOT NULL), '[]') AS images
       FROM products p
       LEFT JOIN product_images pi ON pi.product_id = p.id
       WHERE p.category_id = $1
       GROUP BY p.id
       ORDER BY p.created_at DESC`,
      [id]
    );

    res.json({
      categories: allCategories.rows,
      category: categoryResult.rows[0],
      products: productResult.rows,
    });
  } catch (err) {
    console.error("Category fetch error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ 4. Ангилал устгах
router.delete("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const categoryId = req.params.id;

    const categoryResult = await client.query("SELECT * FROM categories WHERE id=$1", [categoryId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: "Ангилал олдсонгүй" });
    }

    const productCheck = await client.query(
      "SELECT COUNT(*) FROM products WHERE category_id=$1",
      [categoryId]
    );
    if (parseInt(productCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Энэ ангилалд бараа бүртгэлтэй тул устгах боломжгүй!",
      });
    }

    await client.query("DELETE FROM categories WHERE id=$1", [categoryId]);
    res.json({ message: "Ангилал амжилттай устгагдлаа" });
  } catch (err) {
    console.error("❌ Устгах явцад алдаа гарлаа:", err);
    res.status(500).json({ message: "Устгах явцад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});

module.exports = router;