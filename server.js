const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ===============================
// WEBSITE
// ===============================

app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/healthz", (req, res) => {
    res.json({
        success: true,
        message: "ADMIN HI STORE server đang hoạt động"
    });
});

// ===============================
// SESSION
// ===============================

const sessions = new Map();

function createToken() {
    return crypto.randomBytes(32).toString("hex");
}

function getToken(req) {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return null;
    }

    return header.slice(7).trim();
}

function getUserFromRequest(req) {
    const token = getToken(req);

    if (!token) {
        return null;
    }

    const userId = sessions.get(token);

    if (!userId) {
        return null;
    }

    return db.prepare(`
        SELECT
            id,
            username,
            balance,
            total_deposit,
            total_spent,
            is_admin,
            created_at
        FROM users
        WHERE id = ?
    `).get(userId);
}

function requireLogin(req, res, next) {

    const user = getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập."
        });
    }

    req.user = user;
    next();
}

function requireAdmin(req, res, next) {

    const user = getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập."
        });
    }

    if (!user.is_admin) {
        return res.status(403).json({
            message: "Bạn không có quyền Admin."
        });
    }

    req.user = user;
    next();
}

// ===============================
// REGISTER
// ===============================

app.post("/api/register", async (req, res) => {

    try {

        const username = String(
            req.body.username || ""
        ).trim();

        const password = String(
            req.body.password || ""
        );

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

        const exists = db.prepare(`
            SELECT id
            FROM users
            WHERE username = ?
        `).get(username);

        if (exists) {
            return res.status(409).json({
                message: "Tên đăng nhập đã tồn tại."
            });
        }

        const passwordHash =
            await bcrypt.hash(password, 12);

        db.prepare(`
            INSERT INTO users
            (
                username,
                password_hash,
                balance,
                total_deposit,
                total_spent,
                is_admin
            )
            VALUES (?, ?, 0, 0, 0, 0)
        `).run(
            username,
            passwordHash
        );

        return res.json({
            success: true,
            message: "Đăng ký thành công."
        });

    } catch (error) {

        console.error("REGISTER ERROR:", error);

        return res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

// ===============================
// LOGIN
// ===============================

app.post("/api/login", async (req, res) => {

    try {

        const username = String(
            req.body.username || ""
        ).trim();

        const password = String(
            req.body.password || ""
        );

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE username = ?
        `).get(username);

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

        const token = createToken();

        sessions.set(token, user.id);

        return res.json({
            success: true,
            token,
            userId: user.id,
            username: user.username,
            role: user.is_admin ? "admin" : "user"
        });

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

// ===============================
// LOGOUT
// ===============================

app.post("/api/logout", requireLogin, (req, res) => {

    const token = getToken(req);

    if (token) {
        sessions.delete(token);
    }

    res.json({
        success: true
    });
});

// ===============================
// CURRENT USER
// ===============================

app.get("/api/me", requireLogin, (req, res) => {

    res.json({
        id: req.user.id,
        username: req.user.username,
        balance: req.user.balance,
        totalDeposit: req.user.total_deposit,
        totalSpent: req.user.total_spent,
        role: req.user.is_admin ? "admin" : "user",
        createdAt: req.user.created_at
    });
});

// ===============================
// HISTORY
// ===============================

app.get("/api/history", requireLogin, (req, res) => {

    const rows = db.prepare(`
        SELECT
            id,
            type,
            description,
            amount,
            status,
            created_at
        FROM transactions
        WHERE user_id = ?
        ORDER BY id DESC
        LIMIT 100
    `).all(req.user.id);

    res.json(rows);
});

// ===============================
// CREATE DEPOSIT REQUEST
// ===============================

app.post("/api/deposits", requireLogin, (req, res) => {

    const amount = Number(req.body.amount);

    if (!Number.isFinite(amount) || amount < 1000) {
        return res.status(400).json({
            message: "Số tiền tối thiểu 1.000đ."
        });
    }

    db.prepare(`
        INSERT INTO transactions
        (
            user_id,
            type,
            description,
            amount,
            status
        )
        VALUES (?, 'deposit', ?, ?, 'pending')
    `).run(
        req.user.id,
        "Yêu cầu nạp " + amount.toLocaleString("vi-VN") + "đ",
        Math.floor(amount)
    );

    res.json({
        success: true,
        message: "Đã gửi yêu cầu nạp tiền."
    });
});

// ===============================
// CREATE ORDER
// ===============================

app.post("/api/orders", requireLogin, (req, res) => {

    const product = String(
        req.body.product || ""
    ).trim();

    const price = Number(req.body.price);

    if (!product) {
        return res.status(400).json({
            message: "Sản phẩm không hợp lệ."
        });
    }

    if (!Number.isFinite(price) || price <= 0) {
        return res.status(400).json({
            message: "Giá sản phẩm không hợp lệ."
        });
    }

    if (req.user.balance < price) {
        return res.status(400).json({
            message: "Số dư không đủ."
        });
    }

    const transaction = db.transaction(() => {

        db.prepare(`
            UPDATE users
            SET
                balance = balance - ?,
                total_spent = total_spent + ?
            WHERE id = ?
        `).run(
            price,
            price,
            req.user.id
        );

        db.prepare(`
            INSERT INTO transactions
            (
                user_id,
                type,
                description,
                amount,
                status
            )
            VALUES (?, 'order', ?, ?, 'completed')
        `).run(
            req.user.id,
            "Mua " + product,
            -price
        );
    });

    transaction();

    res.json({
        success: true,
        message: "Đặt hàng thành công."
    });
});

// ===============================
// ADMIN STATS
// ===============================

app.get(
    "/api/admin/stats",
    requireAdmin,
    (req, res) => {

        const users = db.prepare(`
            SELECT COUNT(*) AS count
            FROM users
        `).get().count;

        const deposits = db.prepare(`
            SELECT COUNT(*) AS count
            FROM transactions
            WHERE type = 'deposit'
            AND status = 'pending'
        `).get().count;

        const orders = db.prepare(`
            SELECT COUNT(*) AS count
            FROM transactions
            WHERE type = 'order'
        `).get().count;

        res.json({
            users,
            deposits,
            orders
        });
    }
);

// ===============================
// ADMIN - USERS
// ===============================

app.get(
    "/api/admin/users",
    requireAdmin,
    (req, res) => {

        const users = db.prepare(`
            SELECT
                id,
                username,
                balance,
                total_deposit,
                total_spent,
                is_admin,
                created_at
            FROM users
            ORDER BY id DESC
        `).all();

        res.json(users);
    }
);

// ===============================
// ADMIN - DEPOSITS
// ===============================

app.get(
    "/api/admin/deposits",
    requireAdmin,
    (req, res) => {

        const deposits = db.prepare(`
            SELECT
                transactions.id,
                transactions.user_id,
                users.username,
                transactions.amount,
                transactions.status,
                transactions.created_at
            FROM transactions
            JOIN users
            ON users.id = transactions.user_id
            WHERE transactions.type = 'deposit'
            ORDER BY transactions.id DESC
        `).all();

        res.json(deposits);
    }
);

// ===============================
// ADMIN - APPROVE DEPOSIT
// ===============================

app.post(
    "/api/admin/deposits/:id/approve",
    requireAdmin,
    (req, res) => {

        const depositId = Number(req.params.id);

        const deposit = db.prepare(`
            SELECT *
            FROM transactions
            WHERE id = ?
            AND type = 'deposit'
            AND status = 'pending'
        `).get(depositId);

        if (!deposit) {
            return res.status(404).json({
                message: "Không tìm thấy yêu cầu nạp."
            });
        }

        const approve = db.transaction(() => {

            db.prepare(`
                UPDATE users
                SET
                    balance = balance + ?,
                    total_deposit = total_deposit + ?
                WHERE id = ?
            `).run(
                deposit.amount,
                deposit.amount,
                deposit.user_id
            );

            db.prepare(`
                UPDATE transactions
                SET status = 'approved'
                WHERE id = ?
            `).run(depositId);
        });

        approve();

        res.json({
            success: true,
            message: "Đã duyệt nạp tiền."
        });
    }
);

// ===============================
// ADMIN - REJECT DEPOSIT
// ===============================

app.post(
    "/api/admin/deposits/:id/reject",
    requireAdmin,
    (req, res) => {

        const depositId = Number(req.params.id);

        const result = db.prepare(`
            UPDATE transactions
            SET status = 'rejected'
            WHERE id = ?
            AND type = 'deposit'
            AND status = 'pending'
        `).run(depositId);

        if (!result.changes) {
            return res.status(404).json({
                message: "Không tìm thấy yêu cầu nạp."
            });
        }

        res.json({
            success: true,
            message: "Đã từ chối yêu cầu."
        });
    }
);

// ===============================
// ADMIN - CHANGE BALANCE
// ===============================

app.post(
    "/api/admin/users/:id/balance",
    requireAdmin,
    (req, res) => {

        const userId = Number(req.params.id);
        const amount = Number(req.body.amount);

        if (!Number.isFinite(amount)) {
            return res.status(400).json({
                message: "Số tiền không hợp lệ."
            });
        }

        const user = db.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                message: "Không tìm thấy tài khoản."
            });
        }

        const result = db.prepare(`
            UPDATE users
            SET balance = balance + ?
            WHERE id = ?
        `).run(
            Math.floor(amount),
            userId
        );

        if (!result.changes) {
            return res.status(400).json({
                message: "Không thể cập nhật số dư."
            });
        }

        res.json({
            success: true,
            message: "Đã cập nhật số dư."
        });
    }
);

// ===============================
// START SERVER
// ===============================

app.listen(PORT, "0.0.0.0", () => {

    console.log(
        `ADMIN HI STORE đang chạy tại port ${PORT}`
    );

});
