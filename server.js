require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { Pool } = require('pg');

const app = express();
app.use(helmet());
app.use(cors({
  origin: 'https://three0minutes-30days.onrender.com',
  credentials: true
}));
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

pool.query(`
  CREATE TABLE IF NOT EXISTS user_states (
    user_id   VARCHAR(255) PRIMARY KEY,
    states    JSONB NOT NULL DEFAULT '[]'::jsonb
  );
`).catch(console.error);

// Add after pool.query for CREATE TABLE
pool.query('SELECT COUNT(*) FROM user_states;').then(({ rows }) => console.log('Table ready:', rows[0].count));

app.use((req, res, next) => {
  let userId = req.headers.cookie?.split(';').find(c => c.trim().startsWith('userId='))?.split('=')[1];
  if (!userId && req.query.userId) userId = req.query.userId;
  if (!userId) {
    userId = 'u_' + Math.random().toString(36).substring(2, 11);
    const opts = `Path=/; HttpOnly${process.env.NODE_ENV === 'production' ? '; Secure; SameSite=Strict' : ''}`;
    res.setHeader('Set-Cookie', `userId=${userId}; ${opts}`);
  }
  req.userId = userId;
  next();
});

app.get('/api/states', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT states FROM user_states WHERE user_id = $1', [req.userId]);
    res.json(rows[0]?.states || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.post('/api/states', async (req, res) => {
  const { states } = req.body;
  if (!Array.isArray(states)) return res.status(400).json({ error: 'Invalid' });
  try {
    await pool.query(
      `INSERT INTO user_states (user_id, states) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET states = $2`,
      [req.userId, JSON.stringify(states)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Backend on ${PORT}`));


