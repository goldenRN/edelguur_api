
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // эсвэл host, user, password, database зэргийг тусад нь өгч болно
});

module.exports = pool;