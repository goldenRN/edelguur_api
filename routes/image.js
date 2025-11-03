const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const pool = require('../db');
const fs = require('fs');


// Зураг хадгалах тохиргоо
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, '/home/ndc-user/image'); // серверийн хадгалах зам
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname)); // давхардалгүй нэр
  },
});

const upload = multer({ storage: storage });

// Олон зураг хүлээж авах route
router.post('/upload', upload.array('images'), async (req, res) => {
  const files = req.files; // олон файл
  const newsid = req.body.newsid;

  if (!files || files.length === 0) {
    return res.status(400).json({ error: 'Зураг оруулаагүй байна' });
  }

  try {
    // Файлуудын замыг хадгалах
    const inserted = [];

    for (const file of files) {
       const relativePath = `image/${path.basename(file.path)}`; 
      const result = await pool.query(
        'INSERT INTO image (imagepath, newsid) VALUES ($1, $2) RETURNING *',
        [relativePath, newsid]
      );
      // await pool.query(
      //   'INSERT INTO image (imagepath, newsid) VALUES ($1, $2) RETURNING *',
      //   [file.path, newsid]
      // );
      inserted.push(result.rows[0]);
    }

    res.status(200).json({ message: 'Амжилттай', data: inserted });
  } catch (err) {
    console.error('Image upload алдаа:', err);
    res.status(500).json({ error: err.stack });
  }
});
/**
 * @route GET /api/image/:newsid
 * @desc Тухайн мэдээтэй холбоотой бүх зургуудыг авах
 */
router.get('/:newsid', async (req, res) => {
  const { newsid } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM image WHERE newsid = $1',
      [newsid]
    );

    res.json({ images: result.rows });
  } catch (err) {
    console.error('Зураг авахад алдаа:', err.message);
    res.status(500).json({ error: 'Серверийн алдаа' });
  }
});

router.delete('/delete/:id/:filename', async (req, res) => {
  const { id, filename } = req.params;
 // const onlyname = path.basename(filename);
  const imagePath = path.join('/home/ndc-user', filename);

  try {
    // DB-с зураг устгах
    const result = await pool.query('DELETE FROM image WHERE imageid = $1 RETURNING *', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Мэдээлэл олдсонгүй' });
    }

    // File system-с зураг устгах
    fs.unlink(imagePath, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error('Файл устгах үед алдаа:', err.message);
        return res.status(500).json({ error: 'Файл устгаж чадсангүй' });
      }

      // ENOENT = файл олдоогүй бол ч гэсэн амжилттай гэж үзэж болно
      return res.status(200).json({
        message: 'Зураг болон мэдээлэл амжилттай устлаа',
        deleted: result.rows[0],
      });
    });
  } catch (err) {
    console.error('Устгах үед алдаа:', err.message);
    res.status(500).json({ error: 'Серверийн алдаа' });
  }
});

module.exports = router;
