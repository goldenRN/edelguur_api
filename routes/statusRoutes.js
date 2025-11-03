const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * ✅ 1. Бүх төлөвүүдийг авах
 * GET /api/status
 */
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM status ORDER BY id ASC");
        res.json(result.rows);
    } catch (error) {
        console.error("GET /status error:", error);
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ 2. Нэг төлөв авах
 * GET /api/status/:id
 */
router.get("/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query("SELECT * FROM status WHERE id = $1", [id]);
        if (result.rows.length === 0) return res.status(404).json({ message: "Төлөв олдсонгүй" });
        res.json(result.rows[0]);
    } catch (error) {
        console.error("GET /status/:id error:", error);
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ 3. Төлөв шинээр нэмэх
 * POST /api/status
 */
router.post("/", async (req, res) => {
    try {
        const { name, description } = req.body;
        const result = await pool.query(
            "INSERT INTO status (name, description) VALUES ($1, $2) RETURNING *",
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("POST /status error:", error);
        res.status(500).json({ message: "Серверийн алдаа" });
    }
});

/**
 * ✅ Төлөв засах
 * PUT /api/status/:id
 */
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query(
            "UPDATE status SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
            [name, description, id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Төлөв олдсонгүй" });
        }

        // products хүснэгт дэх status_name-г шинэчлэх
        await client.query(
            "UPDATE products SET status_name=$1 WHERE status_id=$2",
            [name, id]
        );

        await client.query("COMMIT");
        res.json(result.rows[0]);
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("PUT /status/:id error:", error);
        res.status(500).json({ message: "Төлөв засахад алдаа гарлаа" });
    } finally {
        client.release();
    }
});


/**
 * ✅ Төлөв устгах
 * DELETE /api/status/:id
 */
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ⚠️ Эхлээд энэ төлөв ашиглагдаж байгаа эсэхийг шалгана
        const productCheck = await client.query(
            "SELECT COUNT(*) FROM products WHERE status_id=$1",
            [id]
        );

        if (parseInt(productCheck.rows[0].count) > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Энэ төлөвийг бараа ашиглаж байгаа тул устгах боломжгүй!",
            });
        }

        // Төлөвийг устгах
        const result = await client.query(
            "DELETE FROM status WHERE id=$1 RETURNING *",
            [id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Төлөв олдсонгүй" });
        }

        await client.query("COMMIT");
        res.json({ message: "Төлөв амжилттай устгагдлаа" });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("DELETE /status/:id error:", error);
        res.status(500).json({ message: "Төлөв устгах үед серверийн алдаа гарлаа" });
    } finally {
        client.release();
    }
});

module.exports = router;
