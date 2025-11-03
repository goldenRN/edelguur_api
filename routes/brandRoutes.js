const express = require("express");
const pool = require("../db");
const router = express.Router();

// ✅ Бүх брэндийг авах
router.get("/", async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM brands ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Брэндүүдийг татахад алдаа гарлаа" });
    }
});

// ✅ Брэнд нэмэх
router.post("/", async (req, res) => {
    const { name, description } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO brands (name, description) VALUES ($1, $2) RETURNING *",
            [name, description]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Брэнд нэмэхэд алдаа гарлаа" });
    }
});

// ✅ Брэнд засах
router.put("/:id", async (req, res) => {
    const { id } = req.params;
    const { name, description } = req.body;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const result = await client.query(
            "UPDATE brands SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
            [name, description, id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Брэнд олдсонгүй" });
        }

        // products хүснэгт дэх brand_name-г шинэчлэх
        await client.query(
            "UPDATE products SET brand_name=$1 WHERE brand_id=$2",
            [name, id]
        );

        await client.query("COMMIT");
        res.json(result.rows[0]);
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("PUT /brands/:id error:", err);
        res.status(500).json({ message: "Брэнд засахад алдаа гарлаа" });
    } finally {
        client.release();
    }
});


// ✅ Брэнд устгах
router.delete("/:id", async (req, res) => {
    const { id } = req.params;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // ⚠️ Энэ брэнд бараанд ашиглагдаж байгаа эсэхийг шалгана
        const productCheck = await client.query(
            "SELECT COUNT(*) FROM products WHERE brand_id=$1",
            [id]
        );

        if (parseInt(productCheck.rows[0].count) > 0) {
            await client.query("ROLLBACK");
            return res.status(400).json({
                message: "Энэ брэндийг бараа ашиглаж байгаа тул устгах боломжгүй!",
            });
        }

        // Брэндийг устгах
        const result = await client.query(
            "DELETE FROM brands WHERE id=$1 RETURNING *",
            [id]
        );

        if (result.rowCount === 0) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Брэнд олдсонгүй" });
        }

        await client.query("COMMIT");
        res.json({ message: "Брэнд амжилттай устгагдлаа" });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error("DELETE /brands/:id error:", err);
        res.status(500).json({ message: "Брэнд устгахад алдаа гарлаа" });
    } finally {
        client.release();
    }
});


module.exports = router;
