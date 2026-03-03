import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";

const { Pool } = pg;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// إنشاء الجدول تلقائياً
await pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  account_no CHAR(7) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
`);

function generateAccountNumber() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.post("/register", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send("Missing data");
  }

  const hash = await bcrypt.hash(password, 10);

  for (let i = 0; i < 10; i++) {
    const accNo = generateAccountNumber();
    try {
      await pool.query(
        "INSERT INTO users (username, password_hash, account_no) VALUES ($1,$2,$3)",
        [username, hash, accNo]
      );
      return res.send(`Account created. Account number: ${accNo}`);
    } catch (err) {
      if (err.code === "23505") continue;
      return res.status(500).send("Error");
    }
  }

  res.status(500).send("Failed to generate unique account number");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server started");
});
