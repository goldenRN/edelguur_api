const express = require('express');
const router = express.Router();
const pool = require('../db');
const { authMiddleware } = require('./authRoutes');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// ✅ Файлын хадгалах тохиргоо
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

// ✅ 1. Ангилал нэмэх
router.post("/", authMiddleware, upload.single('image'), async (req, res) => {
  try {
    const { name, description } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const result = await pool.query(
      "INSERT INTO categories (name, description, image_url) VALUES ($1, $2, $3) RETURNING *",
      [name, description, image_url]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Ангилал нэмэхэд алдаа гарлаа", error: err });
  }
});

// 📋 2. Бүх ангилал авах
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        c.id AS category_id,
        c.name AS category_name,
        c.image_url AS category_image,
        json_agg(
          json_build_object(
            'id', s.id,
            'name', s.name
          ) FILTER (WHERE s.id IS NOT NULL),'[]'
        ) AS subcategories
      FROM categories c
      LEFT JOIN sub_categories s ON s.category_id = c.id
      GROUP BY c.id
      ORDER BY c.id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
  }
});


// ✅ 3. Ангилал засах (products хүснэгтийн category_name-г шинэчилнэ)
router.put("/:id", authMiddleware, upload.single("image"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, description } = req.body;
    const categoryId = req.params.id;

    // Хуучин ангиллыг авах
    const oldCategory = await client.query("SELECT * FROM categories WHERE id=$1", [categoryId]);
    if (oldCategory.rows.length === 0) {
      return res.status(404).json({ message: "Ангилал олдсонгүй" });
    }

    let image_url = oldCategory.rows[0].image_url;

    // Хэрвээ шинэ зураг ирвэл хуучныг устгах
    if (req.file) {
      if (image_url && fs.existsSync(`.${image_url}`)) {
        fs.unlinkSync(`.${image_url}`);
      }
      image_url = `/uploads/${req.file.filename}`;
    }

    await client.query("BEGIN");

    // categories хүснэгт шинэчлэх
    const updatedCategory = await client.query(
      "UPDATE categories SET name=$1, description=$2, image_url=$3 WHERE id=$4 RETURNING *",
      [name, description, image_url, categoryId]
    );

    // products хүснэгт дэх category_name-г шинэчлэх
    await client.query(
      "UPDATE products SET category_name=$1 WHERE category_id=$2",
      [name, categoryId]
    );

    await client.query("COMMIT");

    res.json(updatedCategory.rows[0]);
  } catch (err) {
    await pool.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Ангилал засахад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});

// ❌ 4. Ангилал устгах (бараа бүртгэлтэй эсэхийг шалгана)
router.delete("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();
  try {
    const categoryId = req.params.id;

    // Ангилал байгаа эсэхийг шалгах
    const categoryResult = await client.query("SELECT * FROM categories WHERE id=$1", [categoryId]);
    if (categoryResult.rows.length === 0) {
      return res.status(404).json({ message: "Ангилал олдсонгүй" });
    }

    // Энэ ангилалд бараа бүртгэлтэй эсэхийг шалгах
    const productCheck = await client.query(
      "SELECT COUNT(*) FROM products WHERE category_id=$1",
      [categoryId]
    );
    if (parseInt(productCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Энэ ангилалд бараа бүртгэлтэй тул устгах боломжгүй!",
      });
    }

    const category = categoryResult.rows[0];

    // Хэрвээ зураг байвал устгах
    if (category.image_url && fs.existsSync(`.${category.image_url}`)) {
      fs.unlinkSync(`.${category.image_url}`);
    }

    // Ангиллыг устгах
    await client.query("DELETE FROM categories WHERE id=$1", [categoryId]);

    res.json({ message: "Ангилал амжилттай устгагдлаа" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Устгах явцад алдаа гарлаа", error: err });
  } finally {
    client.release();
  }
});

module.exports = router;
