
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
  const client = await pool.connect();
  try {
    const { description } = req.body;

    if (!req.file) {
      return res.status(400).json({ message: "Зураг шаардлагатай" });
    }

    // 🟢 Cloudinary-д зураг upload хийх
    const uploadRes = await cloudinary.uploader.upload(req.file.path, {
      folder: "edelguur/banner",
    });

    const image_url = uploadRes.secure_url;
    const public_id = uploadRes.public_id;

    // 🟢 DB-д хадгалах
    const result = await client.query(
      `INSERT INTO banners (description, image_url, public_id, created_at)
       VALUES ($1, $2, $3, NOW())
       RETURNING *`,
      [description, image_url, public_id]
    );

    res.status(201).json({
      message: "✅ Баннер амжилттай нэмэгдлээ",
      banner: result.rows[0],
    });
  } catch (err) {
    console.error("❌ Баннер нэмэхэд алдаа:", err);
    res.status(500).json({
      message: "Баннер нэмэхэд алдаа гарлаа",
      error: err.message,
    });
  } finally {
    client.release();
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
    const { description } = req.body;
    const id = req.params.id;

    // 🟡 1. Одоогийн banner-г шалгах
    const oldBannerRes = await client.query("SELECT * FROM banners WHERE id=$1", [id]);
    if (oldBannerRes.rows.length === 0) {
      return res.status(404).json({ message: "Баннер олдсонгүй" });
    }

    const oldBanner = oldBannerRes.rows[0];
    let image_url = oldBanner.image_url;
    let public_id = oldBanner.public_id;

    // 🟢 2. Шинэ зураг ирсэн бол хуучныг устгаад шинэ зураг upload хийнэ
    if (req.file) {
      // Хуучин зураг устгах
      if (oldBanner.public_id) {
        try {
          await cloudinary.uploader.destroy(oldBanner.public_id);
          console.log("🧹 Cloudinary хуучин зураг устгалаа:", oldBanner.public_id);
        } catch (err) {
          console.warn("⚠️ Хуучин зураг устгах алдаа:", err.message);
        }
      }

      // Шинэ зураг upload хийх
      const uploadRes = await cloudinary.uploader.upload(req.file.path, {
        folder: "edelguur/banner",
      });

      image_url = uploadRes.secure_url;
      public_id = uploadRes.public_id;
    }

    await client.query("BEGIN");

    // 🟢 3. DB-д шинэ мэдээллийг хадгалах
    const updatedBanner = await client.query(
      `UPDATE banners 
       SET description=$1, image_url=$2, public_id=$3, updated_at=NOW() 
       WHERE id=$4 
       RETURNING *`,
      [description, image_url, public_id, id]
    );

    await client.query("COMMIT");

    res.json({
      message: "✅ Баннер амжилттай шинэчлэгдлээ",
      banner: updatedBanner.rows[0],
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Баннер засахад алдаа:", err);
    res.status(500).json({ message: "Баннер засахад алдаа гарлаа", error: err.message });
  } finally {
    client.release();
  }
});


// ✅ 4. баннер устгах
router.delete("/:id", authMiddleware, async (req, res) => {
  const client = await pool.connect();

  try {
    const bannerId = req.params.id;

    // 🟡 1. Banner мэдээлэл авах (public_id олох)
    const result = await client.query(
      "SELECT public_id FROM banners WHERE id=$1",
      [bannerId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Баннер олдсонгүй" });
    }

    const publicId = result.rows[0].public_id;

    // 🟢 2. Cloudinary-с устгах
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log("🧹 Cloudinary-гаас устгалаа:", publicId);
      } catch (err) {
        console.warn("⚠️ Cloudinary устгалд алдаа:", err.message);
      }
    }

    // 🟢 3. DB-с устгах
    await client.query("DELETE FROM banners WHERE id=$1", [bannerId]);

    res.json({ message: "✅ Баннер амжилттай устгагдлаа" });
  } catch (err) {
    console.error("❌ Устгах явцад алдаа гарлаа:", err);
    res.status(500).json({ message: "Устгах явцад алдаа гарлаа", error: err.message });
  } finally {
    client.release();
  }
});

module.exports = router;