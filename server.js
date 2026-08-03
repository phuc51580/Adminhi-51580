const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Website
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

// Kiểm tra server
app.get("/healthz", (req, res) => {
    res.json({
        success: true,
        message: "ADMIN HI STORE server đang hoạt động"
    });
});

// ĐĂNG KÝ
app.post("/api/register", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        if (username.length < 3) {
            return res.status(400).json({
                message: "Tên đăng nhập phải có ít nhất 3 ký tự."
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                message: "Mật khẩu phải có ít nhất 4 ký tự."
            });
        }

        const exists = db
            .prepare("SELECT id FROM users WHERE username = ?")
            .get(username);

        if (exists) {
            return res.status(409).json({
                message: "Tên đăng nhập đã tồn tại."
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users
            (username, password_hash)
            VALUES (?, ?)
        `).run(username, passwordHash);

        res.json({
            success: true,
            message: "Đăng ký thành công."
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

// ĐĂNG NHẬP
app.post("/api/login", async (req, res) => {
    try {
        const username = String(req.body.username || "").trim();
        const password = String(req.body.password || "");

        const user = db
            .prepare(`
                SELECT *
                FROM users
                WHERE username = ?
            `)
            .get(username);

        if (!user) {
            return res.status(401).json({
                message: "Sai tài khoản hoặc mật khẩu."
            });
        }

        const valid = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!valid) {
            return res.status(401).json({
                message: "Sai tài khoản hoặc mật khẩu."
            });
        }

        // Tạm thời trả về ID.
        // Bước sau sẽ đổi thành session/token bảo mật.
        res.json({
            success: true,
            userId: user.id,
            username: user.username
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

app.listen(PORT, "0.0.0.0", () => {
    console.log(`ADMIN HI STORE chạy tại port ${PORT}`);
});
