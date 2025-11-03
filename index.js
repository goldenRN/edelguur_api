const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// routes
// const authRoute = require('./routes/authRoutes');
const unitRoutes = require('./routes/unitRoutes.js');
const subCategoryRoutes = require('./routes/subCategoryRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const orderRoutes = require('./routes/orderRoutes');
const brandRoutes = require('./routes/brandRoutes.js');
const productRoutes = require('./routes/productRoutes.js');
const imageRoutes = require('./routes/image');
const productImageRoutes = require('./routes/productImageRoutes');
const statusRoutes = require("./routes/statusRoutes.js");
const { router: authRoute } = require('./routes/authRoutes');


dotenv.config();

const app = express();

// Middleware
app.use(express.json({ type: 'application/json' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors());
// app.use('/uploads', express.static('/home/ndc-user/image'));
app.use('/uploads', express.static('uploads'));

// Routes
app.use('/api/auth', authRoute); //nevtreh
app.use('/api/unit', unitRoutes); //. hemjih negj
app.use('/api/subcategory', subCategoryRoutes); //ded angilal
app.use('/api/category', categoryRoutes); // angilal
app.use('/api/product', productRoutes); //baraa
app.use('/api/brand', brandRoutes); // brand
app.use('/api/image', imageRoutes); // zurag
app.use('/api/productimg', productImageRoutes); // product zurag
app.use("/api/status", statusRoutes); // tolov
// Default route
app.get('/', (req, res) => {
  res.send('API is working!');
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
