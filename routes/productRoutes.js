const express = require("express");
const pool = require("../db");
const router = express.Router();

const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
const fs = require('fs');
dotenv.config();


// Cloudinary тохиргоо
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});
// ✅ Бүх бараа авах
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM products ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Барааны жагсаалт татахад алдаа гарлаа" });
    }
});
// 🆕 Шинэ бараа (created_at -аар эрэмбэлж 10 ширхэг)
router.get("/latest", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT p.*, 
        json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url)) AS images
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
      LIMIT 10
    `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Latest products error:", err);
        res.status(500).json({ message: "Шинэ бараа татахад алдаа гарлаа" });
    }
});

// 🔥 Эрэлттэй бараа (жишээ нь stock бага эсвэл status_id = 3 гэх мэт)
router.get("/popular", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT p.*, 
        json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url)) AS images
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id
      WHERE p.status_id = 3
      GROUP BY p.id
      ORDER BY p.updated_at DESC
      LIMIT 10
    `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Popular products error:", err);
        res.status(500).json({ message: "Эрэлттэй бараа татахад алдаа гарлаа" });
    }
});

// 🧺 Бүх бараа (10 ширхэг)
router.get("/all", async (req, res) => {
    try {
        const result = await pool.query(`
      SELECT p.*, 
        json_agg(json_build_object('id', pi.id, 'image_url', pi.image_url)) AS images
      FROM products p
      LEFT JOIN product_images pi ON pi.product_id = p.id
      GROUP BY p.id
      ORDER BY p.id DESC
      LIMIT 10
    `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ All products error:", err);
        res.status(500).json({ message: "Бүх бараа татахад алдаа гарлаа" });
    }
});

// ✅ Бараа нэмэх
router.post("/", async (req, res) => {
    const {
        name,
        description,
        category_id,
        category_name,
        subcategory_id,
        subcategory_name,
        brand_id,
        brand_name,
        unit_id,
        unit_name,
        status_id,
        status_name,
        price,
        stock,
        images = [], // [{ image_url, public_id }]
    } = req.body;

    const safeInt = (v) =>
        v === "" || v === undefined || v === null ? null : parseInt(v);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 🟢 Бараа үүсгэх
        const insertProductRes = await client.query(
            `INSERT INTO products 
        (name, description, category_id, category_name, subcategory_id, subcategory_name,
         brand_id, brand_name, unit_id, unit_name, status_id, status_name,
         price, stock, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
       RETURNING id`,
            [
                name,
                description,
                safeInt(category_id),
                category_name || null,
                safeInt(subcategory_id),
                subcategory_name || null,
                safeInt(brand_id),
                brand_name || null,
                safeInt(unit_id),
                unit_name || null,
                safeInt(status_id),
                status_name || null,
                price ? parseFloat(price) : 0,
                stock ? parseInt(stock) : 0,
            ]
        );

        const productId = insertProductRes.rows[0].id;

        // 🟩 Хэрэв зураг байгаа бол бүгдийг хадгална
        for (const img of images) {
            await client.query(
                "INSERT INTO product_images (product_id, image_url, public_id) VALUES ($1, $2, $3)",
                [productId, img.image_url, img.public_id]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Бараа амжилттай нэмэгдлээ",
            product_id: productId,
            added_images: images.length,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Product insert error:", err);
        res.status(500).json({
            success: false,
            message: "Бараа нэмэхэд алдаа гарлаа",
            error: err,
        });
    } finally {
        client.release();
    }
});


// ✅ Product засах + зураг шинэчлэх
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const {
        name,
        description,
        category_id,
        category_name,
        subcategory_id,
        subcategory_name,
        brand_id,
        brand_name,
        unit_id,
        unit_name,
        status_id,
        status_name,
        price,
        stock,
        type_id,
        type_name,
        images = [], // ⬅️ front-оос ирэх [{ image_url, public_id }]
    } = req.body;

    const safeInt = (v) =>
        v === "" || v === undefined || v === null ? null : parseInt(v);

    const client = await pool.connect();

    try {
        await client.query("BEGIN");

        // 🟢 Product мэдээлэл шинэчлэх
        await client.query(
            `UPDATE products 
       SET name=$1, description=$2, category_id=$3, category_name=$4,
           subcategory_id=$5, subcategory_name=$6,
           brand_id=$7, brand_name=$8,
           unit_id=$9, unit_name=$10,
           status_id=$11, status_name=$12,
           price=$13, stock=$14, 
           type_id=$15, type_name=$16,
           updated_at=NOW()
       WHERE id=$17`,
            [
                name,
                description,
                safeInt(category_id),
                category_name || null,
                safeInt(subcategory_id),
                subcategory_name || null,
                safeInt(brand_id),
                brand_name || null,
                safeInt(unit_id),
                unit_name || null,
                safeInt(status_id),
                status_name || null,
                price ? parseFloat(price) : 0,
                stock ? parseInt(stock) : 0,
                safeInt(type_id),
                type_name || null,
                id,
            ]
        );

        // 🟩 Одоогийн зургуудыг DB-с татах
        const oldImagesRes = await client.query(
            "SELECT id, image_url, public_id FROM product_images WHERE product_id = $1",
            [id]
        );
        const oldImages = oldImagesRes.rows;
        const oldPublicIds = oldImages.map((img) => img.public_id);
        const newPublicIds = images.map((img) => img.public_id);

        // 🟥 Устгах зураг (DB-д байгаа боловч шинэ жагсаалтад байхгүй)
        const toDelete = oldImages.filter(
            (img) => !newPublicIds.includes(img.public_id)
        );

        for (const img of toDelete) {
            if (img.public_id) await cloudinary.uploader.destroy(img.public_id);
            await client.query("DELETE FROM product_images WHERE id = $1", [img.id]);
        }

        // 🟢 Нэмэгдэх шинэ зураг (шинэ жагсаалтад байгаа боловч DB-д байхгүй)
        const toInsert = images.filter(
            (img) => !oldPublicIds.includes(img.public_id)
        );

        for (const img of toInsert) {
            await client.query(
                "INSERT INTO product_images (product_id, image_url, public_id) VALUES ($1, $2, $3)",
                [id, img.image_url, img.public_id]
            );
        }

        await client.query("COMMIT");

        res.json({
            success: true,
            message: "Бараа болон зураг амжилттай шинэчлэгдлээ",
            deleted: toDelete.length,
            added: toInsert.length,
        });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("❌ Product update error:", err);
        res
            .status(500)
            .json({ success: false, message: "Бараа засахад алдаа гарлаа", err });
    } finally {
        client.release();
    }
});




// ✅ Бараа устгах
router.delete("/:id", async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query("DELETE FROM products WHERE id=$1", [id]);
        if (result.rowCount === 0)
            return res.status(404).json({ message: "Бараа олдсонгүй" });

        res.json({ message: "Амжилттай устгалаа" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Бараа устгахад алдаа гарлаа" });
    }
});

// GET /api/product/:id
router.get("/:id", async (req, res) => {
    const { id } = req.params;

    try {
        const productRes = await pool.query(
            `SELECT p.*, 
              c.name AS category_name, 
              s.name AS subcategory_name, 
              b.name AS brand_name, 
              u.name AS unit_name, 
              st.name AS status_name,
              t.name AS type_name,
       FROM products p
       LEFT JOIN categories c ON p.category_id = c.id
       LEFT JOIN sub_categories s ON p.subcategory_id = s.id
       LEFT JOIN brands b ON p.brand_id = b.id
       LEFT JOIN units u ON p.unit_id = u.id
       LEFT JOIN status st ON p.status_id = st.id
       LEFT JOIN typetable t ON p.type_id = t.id
       WHERE p.id = $1`,
            [id]
        );

        if (productRes.rows.length === 0)
            return res.status(404).json({ message: "Product not found" });

        const product = productRes.rows[0];

        // Зурагнуудыг тусад нь татах
        const imageRes = await pool.query(
            "SELECT image_url FROM product_images WHERE product_id = $1",
            [id]
        );
        product.image_urls = imageRes.rows.map((img) => img.image_url);

        res.json(product);
    } catch (err) {
        console.error("Error fetching product:", err);
        res.status(500).json({ message: "Бараа татахад алдаа гарлаа" });
    }
});
// ✅ Get products by category ID
router.get("/category/:id", async (req, res) => {
    const { id } = req.params;

    try {
        // Категорийн нэр авах
        const categoryResult = await pool.query(
            `SELECT name FROM categories WHERE id = $1`,
            [id]
        );

        // Тухайн категорийн бараанууд
        const productResult = await pool.query(
            `SELECT p.*, 
        COALESCE(
          json_agg(
            json_build_object('image_id', pi.id, 'image_url', pi.image_url)
          ) FILTER (WHERE pi.id IS NOT NULL), '[]'
        ) AS images
      FROM products p
      LEFT JOIN product_images pi ON p.id = pi.product_id
      WHERE p.category_id = $1
      GROUP BY p.id
      ORDER BY p.created_at DESC`,
            [id]
        );

        res.json({
            category_name: categoryResult.rows[0]?.name || "Тодорхойгүй",
            products: productResult.rows,
        });
    } catch (err) {
        console.error("Error fetching category products:", err);
        res.status(500).json({ error: "Database алдаа" });
    }
});




module.exports = router;
