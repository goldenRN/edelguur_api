
const express = require("express");
const pool = require("../db");
const router = express.Router();
const dotenv = require("dotenv");
dotenv.config();



// Create new order
router.post("/", async (req, res) => {
    const client = await pool.connect();

    try {
        const { name, email, phone1, phone2, message, cart } = req.body;

        if (!name || !phone1 || !cart || cart.length === 0) {
            return res.status(400).json({ error: "Invalid request data" });
        }

        await client.query("BEGIN");

        // 1. Insert into orders table
        const orderResult = await client.query(
            `
      INSERT INTO orders (name, email, phone1, phone2, message)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
      `,
            [name, email, phone1, phone2, message]
        );

        const orderId = orderResult.rows[0].id;

        // 2. Prepare insert for order_items
        const itemValues = cart
            .map(
                (_, i) =>
                    `($1, $${i * 4 + 2}, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5})`
            )
            .join(",");

        const flatValues = cart.flatMap((item) => [
            item.id,
            item.name,
            item.price,
            item.qty,
        ]);

        // 3. Insert into order_items
        await client.query(
            `
      INSERT INTO order_items 
      (order_id, product_id, product_name, price, quantity)
      VALUES ${itemValues}
      `,
            [orderId, ...flatValues]
        );

        await client.query("COMMIT");

        return res.json({ success: true, order_id: orderId });
    } catch (err) {
        await client.query("ROLLBACK");
        console.error(err);
        return res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/orders
// query: page, limit, q (search), status
router.get("/", async (req, res) => {
  const client = await pool.connect();
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const q = (req.query.q || "").trim();
    const status = req.query.status;

    // base where
    const whereClauses = [];
    const params = [];

    if (q) {
      params.push(`%${q}%`);
      whereClauses.push(`(o.name ILIKE $${params.length} OR o.email ILIKE $${params.length} OR CAST(o.id AS TEXT) ILIKE $${params.length})`);
    }

    if (status) {
      params.push(status);
      whereClauses.push(`o.status = $${params.length}`);
    }

    const whereSql = whereClauses.length ? "WHERE " + whereClauses.join(" AND ") : "";

    // total count
    const countRes = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM orders o
       ${whereSql}`,
      params
    );
    const total = countRes.rows[0].total;

    // main list with pagination
    // get basic order fields and total computed if not stored
    const listRes = await client.query(
      `
      SELECT o.id, o.name, o.email, o.phone1, o.phone2, o.status, o.created_at, o.total
      FROM orders o
      ${whereSql}
      ORDER BY o.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `,
      [...params, limit, offset]
    );

    return res.json({
      data: listRes.rows,
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/orders/:id  -> return order + items
router.get("/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const orderRes = await client.query(`SELECT * FROM orders WHERE id = $1`, [id]);
    if (orderRes.rowCount === 0) return res.status(404).json({ error: "Not found" });

    const itemsRes = await client.query(
      `SELECT id, product_id, product_name, quantity, price FROM order_items WHERE order_id = $1 ORDER BY id`,
      [id]
    );

    return res.json({ order: orderRes.rows[0], items: itemsRes.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// PATCH /api/orders/:id/status  -> update status
router.patch("/:id/status", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "Missing status" });

    const upd = await client.query(
      `UPDATE orders SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );
    if (upd.rowCount === 0) return res.status(404).json({ error: "Not found" });

    return res.json({ order: upd.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/orders/export - бүх захиалгыг CSV болгох
router.get("/export", async (req, res) => {
  const client = await pool.connect();
  try {
    const ordersRes = await client.query(`
      SELECT o.id, o.name, o.email, o.phone1, o.phone2, o.status, o.created_at, o.total
      FROM orders o
      ORDER BY o.created_at DESC
    `);

    const header = ["ID", "Нэр", "Имэйл", "Утас", "Төлөв", "Огноо", "Нийт дүн"];
    const rows = ordersRes.rows.map(o => [
      o.id,
      o.name,
      o.email ?? "",
      o.phone1,
      o.status,
      o.created_at,
      o.total
    ]);

    const csv = [
      header.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="orders_all.csv"`);

    return res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// GET /api/orders/export/excel - бүх захиалгыг Excel болгох
router.get("/export/excel", async (req, res) => {
  const client = await pool.connect();
  try {
    const ordersRes = await client.query(`
      SELECT o.id, o.name, o.email, o.phone1, o.phone2, o.status, o.created_at, o.total
      FROM orders o
      ORDER BY o.created_at DESC
    `);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Orders");

    sheet.columns = [
      { header: "ID", key: "id", width: 10 },
      { header: "Нэр", key: "name", width: 25 },
      { header: "Имэйл", key: "email", width: 25 },
      { header: "Утас", key: "phone1", width: 15 },
      { header: "Төлөв", key: "status", width: 15 },
      { header: "Огноо", key: "created_at", width: 25 },
      { header: "Нийт дүн", key: "total", width: 15 },
    ];

    ordersRes.rows.forEach(o => {
      sheet.addRow({
        id: o.id,
        name: o.name,
        email: o.email ?? "",
        phone1: o.phone1,
        status: o.status,
        created_at: o.created_at,
        total: o.total,
      });
    });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="orders.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});
module.exports = router;