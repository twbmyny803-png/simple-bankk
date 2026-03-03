import express from "express";
import pg from "pg";
import bcrypt from "bcryptjs";

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const { Pool } = pg;

// ✅ لازم يكون اسم المتغير في Render: DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

function page(title, content) {
  return `
  <html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body{font-family:Arial;max-width:500px;margin:40px auto;padding:0 12px}
      input,button{width:100%;padding:10px;margin:6px 0;font-size:16px}
      .card{border:1px solid #ddd;padding:15px;border-radius:8px;margin-bottom:12px}
      .err{color:#b00020}
      a{display:inline-block;margin-top:10px}
    </style>
  </head>
  <body>
  ${content}
  </body>
  </html>
  `;
}

// ✅ إنشاء الجدول (داخل دالة تشغيل)
async function initDb() {
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
}

// توليد رقم حساب 7 أرقام (غير مكرر)
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

// صفحة رئيسية
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

// تسجيل
app.post("/register", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const password = req.body.password || "";

    if (!username || !password) {
      return res.send(page("خطأ", `<p class="err">املأ كل الحقول</p><a href="/">رجوع</a>`));
    }

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
          <p>الرصيد المبدئي: ${u.balance}</p>
        </div>
        <a href="/">رجوع</a>
        `
      )
    );
  } catch (e) {
    // غالباً username مكرر
    res.send(page("خطأ", `<p class="err">اسم المستخدم مستخدم قبل كده</p><a href="/">رجوع</a>`));
  }
});

// دخول
app.post("/login", async (req, res) => {
  try {
    const username = (req.body.username || "").trim();
    const password = req.body.password || "";

    const r = await pool.query("SELECT * FROM users WHERE username = $1", [username]);
    if (r.rowCount === 0) {
      return res.send(page("خطأ", `<p class="err">المستخدم غير موجود</p><a href="/">رجوع</a>`));
    }

    const user = r.rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);

    if (!ok) {
      return res.send(page("خطأ", `<p class="err">كلمة السر غلط</p><a href="/">رجوع</a>`));
    }

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
  } catch (e) {
    res.send(page("خطأ", `<p class="err">حصل خطأ في السيرفر</p><a href="/">رجوع</a>`));
  }
});

// health check (اختياري مفيد)
app.get("/health", (req, res) => res.send("OK"));

async function start() {
  // مهم: يتأكد الجدول اتعمل قبل السيرفر يشتغل
  await initDb();

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("Server running on", PORT));
}

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
