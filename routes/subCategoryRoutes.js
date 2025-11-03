const express = require('express');
const pool = require('../db');
const router = express.Router();

// ✅ 1. Get all sub categories
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT s.*, c.name AS category_name
      FROM sub_categories s
      JOIN categories c ON s.category_id = c.id
      ORDER BY s.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching sub categories" });
  }
});


// ✅ 2. Add new sub category
router.post("/", async (req, res) => {
  const { name, description, category_id } = req.body;
  if (!name || !category_id)
    return res.status(400).json({ message: "Name and category_id required" });

  try {
    const result = await pool.query(
      "INSERT INTO sub_categories (name, description, category_id) VALUES ($1, $2, $3) RETURNING *",
      [name, description, category_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error creating sub category" });
  }
});


// ✅ 3. Edit sub category (бас products хүснэгт дэх subcategory_name-г шинэчилнэ)
router.put("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, description, category_id } = req.body;

    await client.query("BEGIN");

    // subcategory-г шинэчлэх
    const result = await client.query(
      `UPDATE sub_categories 
       SET name=$1, description=$2, category_id=$3, updated_at=NOW() 
       WHERE id=$4 
       RETURNING *`,
      [name, description, category_id, id]
    );

    if (result.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Sub category not found" });
    }

    // products хүснэгтийн subcategory_name-г шинэчлэх
    await client.query(
      "UPDATE products SET subcategory_name=$1 WHERE subcategory_id=$2",
      [name, id]
    );

    await client.query("COMMIT");

    // шинэчилсэн мөрийг буцаах
    const joined = await client.query(
      `SELECT s.*, c.name AS category_name
       FROM sub_categories s
       JOIN categories c ON s.category_id = c.id
       WHERE s.id = $1`,
      [id]
    );

    res.json(joined.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Error updating sub category" });
  } finally {
    client.release();
  }
});


// ✅ 4. Delete sub category (устгахаас өмнө бараа бүртгэлтэй эсэхийг шалгана)
router.delete("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    // тухайн subcategory-г ашиглаж буй бараа байгаа эсэхийг шалгах
    const check = await client.query(
      "SELECT COUNT(*) FROM products WHERE subcategory_id=$1",
      [id]
    );

    if (parseInt(check.rows[0].count) > 0) {
      return res
        .status(400)
        .json({ message: "Энэ дэд ангилалд бараа бүртгэлтэй тул устгах боломжгүй!" });
    }

    const result = await client.query("DELETE FROM sub_categories WHERE id=$1", [id]);

    if (result.rowCount === 0)
      return res.status(404).json({ message: "Sub category not found" });

    res.json({ message: "Sub category deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error deleting sub category" });
  } finally {
    client.release();
  }
});

module.exports = router;
