import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// إنشاء جدول لو ما موجود
await pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  account_number CHAR(7) UNIQUE NOT NULL,
  balance BIGINT NOT NULL DEFAULT 5000,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
`);

function page(title, content) {
  return `
  <html>
  <head>
    <title>${title}</title>
    <style>
      body{font-family:Arial;max-width:500px;margin:40px auto}
      input,button{width:100%;padding:10px;margin:6px 0}
      .card{border:1px solid #ddd;padding:15px;border-radius:8px}
    </style>
  </head>
  <body>
  ${content}
  </body>
  </html>
  `;
}

// توليد رقم حساب 7 أرقام
async function generateAccountNumber() {
  while (true) {
    const number = Math.floor(1000000 + Math.random() * 9000000).toString();
    const r = await pool.query(
      "SELECT 1 FROM users WHERE account_number = $1",
      [number]
    );
    if (r.rowCount === 0) return number;
  }
}

app.get("/", (req, res) => {
  res.send(
    page(
      "Simple Bank",
      `
      <div class="card">
        <h2>إنشاء حساب</h2>
        <form method="POST" action="/register">
          <input name="username" placeholder="اسم المستخدم" required />
          <input name="password" type="password" placeholder="كلمة السر" required />
          <button type="submit">تسجيل</button>
        </form>
      </div>

      <div class="card">
        <h2>تسجيل دخول</h2>
        <form method="POST" action="/login">
          <input name="username" placeholder="اسم المستخدم" required />
          <input name="password" type="password" placeholder="كلمة السر" required />
          <button type="submit">دخول</button>
        </form>
      </div>
      `
    )
  );
});

app.post("/register", async (req, res) => {
  try {
    const username = req.body.username.trim();
    const password = req.body.password;

    const hash = await bcrypt.hash(password, 10);
    const accountNumber = await generateAccountNumber();

    const r = await pool.query(
      `INSERT INTO users (username, password_hash, account_number, balance)
       VALUES ($1,$2,$3,$4)
       RETURNING username, account_number, balance`,
      [username, hash, accountNumber, 5000]
    );

    const u = r.rows[0];

    res.send(
      page(
        "تم التسجيل",
        `
        <div class="card">
          <h2>تم إنشاء الحساب ✅</h2>
          <p>اسم المستخدم: ${u.username}</p>
          <p>رقم الحساب: ${u.account_number}</p>
          <p>الرصيد: ${u.balance}</p>
        </div>
        <a href="/">رجوع</a>
        `
      )
    );
  } catch (e) {
    res.send("اسم المستخدم مستخدم قبل كده");
  }
});

app.post("/login", async (req, res) => {
  const username = req.body.username.trim();
  const password = req.body.password;

  const r = await pool.query(
    "SELECT * FROM users WHERE username = $1",
    [username]
  );

  if (r.rowCount === 0) return res.send("المستخدم غير موجود");

  const user = r.rows[0];
  const ok = await bcrypt.compare(password, user.password_hash);

  if (!ok) return res.send("كلمة السر غلط");

  res.send(
    page(
      "الحساب",
      `
      <div class="card">
        <h2>مرحبا ${user.username}</h2>
        <p>رقم الحساب: ${user.account_number}</p>
        <p>الرصيد: ${user.balance}</p>
      </div>
      <a href="/">تسجيل خروج</a>
      `
    )
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
