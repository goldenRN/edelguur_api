const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * ✅ 1. Бүх төрөл авах
 * GET /api/status
 */
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM typetable ORDER BY id ASC");
        res.json(result.rows);
    } catch (error) {
        console.error("GET /status error:", error);
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ 2. Нэг төрөл авах
 * GET /api/type/:id
 */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM typetable WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "төрөл олдсонгүй" });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ 3. төрөл шинээр нэмэх
 * POST /api/type
 */
router.post("/", async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await pool.query(
            "INSERT INTO typetable (name, description) VALUES ($1, $2) RETURNING *",
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ төрөл засах
 * PUT /api/type/:id
 */
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query(
            "UPDATE typetable SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
            [name, description, id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "төрөл олдсонгүй" });
        }

        // products хүснэгт дэх type_name-г шинэчлэх
        await client.query(
            "UPDATE products SET type_name=$1 WHERE type_id=$2",
            [name, id]
        );

        await client.query("COMMIT");
        res.json(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "төрөл засахад алдаа гарлаа" });
    } finally {
        client.release();
    }
});


/**
 * ✅ төрөл устгах
 * DELETE /api/type/:id
 */
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ⚠️ Эхлээд энэ төрөл ашиглагдаж байгаа эсэхийг шалгана
        const productCheck = await client.query(
            "SELECT COUNT(*) FROM products WHERE type_id=$1",
            [id]
        );

        if (parseInt(productCheck.rows[0].count) > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Энэ төрөлийг бараа ашиглаж байгаа тул устгах боломжгүй!",
            });
        }

        // төрөлийг устгах
        const result = await client.query(
            "DELETE FROM typetable WHERE id=$1 RETURNING *",
            [id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "төрөл олдсонгүй" });
        }

        await client.query("COMMIT");
        res.json({ message: "төрөл амжилттай устгагдлаа" });
    } catch (error) {
        await client.query("ROLLBACK");
        res.status(500).json({ message: "төрөл устгах үед серверийн алдаа гарлаа" });
    } finally {
        client.release();
    }
});

module.exports = router;
