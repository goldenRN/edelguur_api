const express = require("express");
const pool = require("../db");
const router = express.Router();
const { v2: cloudinary } = require("cloudinary");
const dotenv = require("dotenv");
dotenv.config();

// Cloudinary тохиргоо
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/*
  product_images structure:
  id SERIAL PRIMARY KEY
  product_id INT
  product_variant_id INT
  image_url TEXT
  public_id TEXT
*/

// ================================
// 📌 GET variants + images by product_id
// ================================
router.get("/:product_id", async (req, res) => {
  const { product_id } = req.params;

  try {
    const variantsRes = await pool.query(
      `SELECT * FROM product_variants WHERE product_id = $1 ORDER BY id ASC`,
      [product_id]
    );

    const imagesRes = await pool.query(
      `SELECT * FROM product_images WHERE product_id = $1`,
      [product_id]
    );

    const variants = variantsRes.rows;
    const images = imagesRes.rows;

    // Зургийг variant-аар нь бүлэглэх
    variants.forEach(v => {
      v.images = images.filter(img => img.product_variant_id === v.id);
    });

    res.json(variants);
  } catch (err) {
    console.error("❌ Variant fetch error:", err);
    res.status(500).json({ message: "Variant татахад алдаа гарлаа" });
  }
});


// ================================
// 📌 POST create variant + images
// ================================
router.post("/", async (req, res) => {
  const { product_id, attribute, price, stock, sku, images = [] } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Variant үүсгэх
    const variantRes = await client.query(
      `INSERT INTO product_variants 
        (product_id, attribute, price, stock, sku, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       RETURNING *`,
      [product_id, attribute || {}, price || 0, stock || 0, sku || null]
    );

    const variant = variantRes.rows[0];

    // Зургийг DB рүү хадгалах
    for (const img of images) {
      await client.query(
        `INSERT INTO product_images (product_id, product_variant_id, image_url, public_id)
         VALUES ($1, $2, $3, $4)`,
        [product_id, variant.id, img.image_url, img.public_id]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Variant болон зураг амжилттай нэмэгдлээ",
      data: variant,
      added_images: images.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Variant insert error:", err);
    res.status(500).json({ message: "Variant нэмэхэд алдаа гарлаа" });
  } finally {
    client.release();
  }
});


// ================================
// 📌 PUT update variant + sync images
// ================================
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { attribute, price, stock, sku, images = [] } = req.body;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Variant update
    const variantRes = await client.query(
      `UPDATE product_variants
       SET attribute=$1, price=$2, stock=$3, sku=$4, updated_at=NOW()
       WHERE id=$5
       RETURNING *`,
      [attribute || {}, price || 0, stock || 0, sku || null, id]
    );

    const variant = variantRes.rows[0];

    // Хуучин зургууд
    const oldImagesRes = await client.query(
      `SELECT * FROM product_images WHERE product_variant_id=$1`,
      [id]
    );
    const oldImages = oldImagesRes.rows;

    const oldPublicIds = oldImages.map(i => i.public_id);
    const newPublicIds = images.map(i => i.public_id);

    // 1️⃣ Устгах зураг (шинэ list-д байхгүй)
    const toDelete = oldImages.filter(i => !newPublicIds.includes(i.public_id));
    for (const img of toDelete) {
      if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
      await client.query(`DELETE FROM product_images WHERE id=$1`, [img.id]);
    }

    // 2️⃣ Нэмэх шинэ зураг
    const toInsert = images.filter(i => !oldPublicIds.includes(i.public_id));
    for (const img of toInsert) {
      await client.query(
        `INSERT INTO product_images (product_id, product_variant_id, image_url, public_id)
         VALUES ($1, $2, $3, $4)`,
        [variant.product_id, variant.id, img.image_url, img.public_id]
      );
    }

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Variant болон зураг амжилттай шинэчлэгдлээ",
      data: variant,
      deleted_images: toDelete.length,
      added_images: toInsert.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Variant update error:", err);
    res.status(500).json({ message: "Variant шинэчлэхэд алдаа гарлаа" });
  } finally {
    client.release();
  }
});


// ================================
// 📌 DELETE variant + its images + cloudinary
// ================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Variant-ийн зураг авах
    const imgRes = await client.query(
      `SELECT * FROM product_images WHERE product_variant_id=$1`,
      [id]
    );

    const images = imgRes.rows;

    // Cloudinary устгах
    for (const img of images) {
      if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
    }

    // DB-с устгах
    await client.query(`DELETE FROM product_images WHERE product_variant_id=$1`, [id]);
    await client.query(`DELETE FROM product_variants WHERE id=$1`, [id]);

    await client.query("COMMIT");

    res.json({
      success: true,
      message: "Variant болон зураг амжилттай устгагдлаа",
      deleted_images: images.length,
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("❌ Variant delete error:", err);
    res.status(500).json({ message: "Variant устгахад алдаа гарлаа" });
  } finally {
    client.release();
  }
});

module.exports = router;
