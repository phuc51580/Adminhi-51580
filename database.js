const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const db = new Database("store.db");

db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    total_deposit INTEGER NOT NULL DEFAULT 0,
    total_spent INTEGER NOT NULL DEFAULT 0,
    is_admin INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    description TEXT NOT NULL,
    amount INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
`);

// Tạo Admin từ Environment Variables
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

if (adminUsername && adminPassword) {
    const existingAdmin = db
        .prepare("SELECT id FROM users WHERE username = ?")
        .get(adminUsername);

    if (!existingAdmin) {
        const passwordHash = bcrypt.hashSync(adminPassword, 12);

        db.prepare(`
            INSERT INTO users
            (username, password_hash, is_admin)
            VALUES (?, ?, 1)
        `).run(
            adminUsername,
            passwordHash
        );

        console.log("ADMIN HI STORE: Đã tạo tài khoản Admin.");
    } else {
        db.prepare(`
            UPDATE users
            SET is_admin = 1
            WHERE username = ?
        `).run(adminUsername);

        console.log("ADMIN HI STORE: Tài khoản Admin đã tồn tại.");
    }
}

module.exports = db;
