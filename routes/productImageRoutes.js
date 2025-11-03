
const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const dotenv = require('dotenv');
const fs = require('fs');
const pool = require("../db");
dotenv.config();

const router = express.Router();

// Cloudinary тохиргоо
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Зураг upload endpoint
// Олон зураг upload
const uploadMultiple = multer({ dest: 'uploads/' }).array('images', 5); // max 5 зураг

router.post('/upload-multiple', uploadMultiple, async (req, res) => {
  try {
    const files = req.files; // array of files
    const uploaded = [];

    for (const file of files) {
      const result = await cloudinary.uploader.upload(file.path, {
        folder: 'products',
        transformation: [{ width: 1000, crop: 'limit' }],
      });

      fs.unlinkSync(file.path);

      uploaded.push({
        imageUrl: result.secure_url,
        public_id: result.public_id,
      });
    }

    res.json({ success: true, images: uploaded });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err, error: err });
  }
});

// GET /api/product/:id/images
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT * FROM product_images WHERE product_id = $1 ORDER BY id ASC",
      [id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Зураг татахад алдаа гарлаа" });
  }
});

module.exports =  router ;
