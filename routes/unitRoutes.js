const express = require("express");
const pool = require('../db');
const router = express.Router();

// ✅ Бүх нэгжийг авах
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM units ORDER BY id DESC");
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Нэгжийн жагсаалт татахад алдаа гарлаа" });
  }
});

// ✅ Нэгж нэмэх
router.post("/", async (req, res) => {
  const { name, description } = req.body;
  try {
    const result = await pool.query(
      "INSERT INTO units (name, description) VALUES ($1, $2) RETURNING *",
      [name, description]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Нэгж нэмэхэд алдаа гарлаа" });
  }
});

// ✅ Нэгж засах (transaction-тай)
router.put("/:id", async (req, res) => {
  const { id } = req.params;
  const { name, description } = req.body;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const result = await client.query(
      "UPDATE units SET name=$1, description=$2, updated_at=NOW() WHERE id=$3 RETURNING *",
      [name, description, id]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Нэгж олдсонгүй" });
    }

    // products хүснэгт дэх unit_name-г шинэчлэх
    await client.query(
      "UPDATE products SET unit_name=$1 WHERE unit_id=$2",
      [name, id]
    );

    await client.query("COMMIT");

    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Нэгж засахад алдаа гарлаа" });
  } finally {
    client.release();
  }
});


// ✅ Нэгж устгах
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // 1️⃣ Эхлээд энэ нэгжийг бараа ашиглаж байгаа эсэхийг шалгана
    const productCheck = await pool.query(
      "SELECT COUNT(*) FROM products WHERE unit_id = $1",
      [id]
    );

    if (parseInt(productCheck.rows[0].count) > 0) {
      return res.status(400).json({
        message: "Энэ нэгжийг ашиглаж байгаа бараа бүртгэлтэй байна. Устгах боломжгүй!",
      });
    }

    // 2️⃣ Хэрвээ ашиглагдаагүй бол устгана
    const result = await pool.query("DELETE FROM units WHERE id = $1", [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Нэгж олдсонгүй" });
    }

    // 3️⃣ Амжилттай устгасан хариу
    res.json({ message: "Амжилттай устгалаа" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Нэгж устгах үед алдаа гарлаа" });
  }
});


module.exports = router;
