const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================
// CẤU HÌNH ADMIN
// =====================================

const ADMIN_USERNAME = "ADMIN";
const ADMIN_PASSWORD = "phc51580";

// =====================================
// MIDDLEWARE
// =====================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(__dirname));

// =====================================
// WEBSITE
// =====================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"));
});

app.get("/healthz", (req, res) => {
    res.json({
        success: true,
        message: "ADMIN HI STORE server đang hoạt động"
    });
});

// =====================================
// SESSION
// =====================================

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

// =====================================
// KIỂM TRA ĐĂNG NHẬP
// =====================================

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

// =====================================
// KIỂM TRA ADMIN
// =====================================

function requireAdmin(req, res, next) {
    const user = getUserFromRequest(req);

    if (!user) {
        return res.status(401).json({
            message: "Bạn chưa đăng nhập."
        });
    }

    if (Number(user.is_admin) !== 1) {
        return res.status(403).json({
            message: "Bạn không có quyền Admin."
        });
    }

    req.user = user;
    next();
}

// =====================================
// TẠO ADMIN TỰ ĐỘNG
// =====================================

async function setupAdmin() {
    try {
        const passwordHash = await bcrypt.hash(
            ADMIN_PASSWORD,
            12
        );

        const existing = db.prepare(`
            SELECT id
            FROM users
            WHERE username = ?
        `).get(ADMIN_USERNAME);

        if (existing) {

            db.prepare(`
                UPDATE users
                SET
                    password_hash = ?,
                    is_admin = 1
                WHERE id = ?
            `).run(
                passwordHash,
                existing.id
            );

            console.log(
                "✅ ADMIN đã được cấp quyền Admin."
            );

        } else {

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
                VALUES (?, ?, 0, 0, 0, 1)
            `).run(
                ADMIN_USERNAME,
                passwordHash
            );

            console.log(
                "✅ Đã tạo tài khoản ADMIN."
            );
        }

    } catch (error) {
        console.error(
            "❌ Lỗi tạo Admin:",
            error
        );
    }
}

// =====================================
// ĐĂNG KÝ
// =====================================

app.post("/api/register", async (req, res) => {

    try {

        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        if (username.length < 3) {
            return res.status(400).json({
                message:
                    "Tên đăng nhập phải có ít nhất 3 ký tự."
            });
        }

        if (password.length < 4) {
            return res.status(400).json({
                message:
                    "Mật khẩu phải có ít nhất 4 ký tự."
            });
        }

        const exists = db.prepare(`
            SELECT id
            FROM users
            WHERE username = ?
        `).get(username);

        if (exists) {
            return res.status(409).json({
                message:
                    "Tên đăng nhập đã tồn tại."
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

        res.json({
            success: true,
            message: "Đăng ký thành công."
        });

    } catch (error) {

        console.error(
            "REGISTER ERROR:",
            error
        );

        res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

// =====================================
// ĐĂNG NHẬP
// =====================================

app.post("/api/login", async (req, res) => {

    try {

        const username =
            String(req.body.username || "").trim();

        const password =
            String(req.body.password || "");

        const user = db.prepare(`
            SELECT *
            FROM users
            WHERE username = ?
        `).get(username);

        if (!user) {
            return res.status(401).json({
                message:
                    "Sai tài khoản hoặc mật khẩu."
            });
        }

        const valid =
            await bcrypt.compare(
                password,
                user.password_hash
            );

        if (!valid) {
            return res.status(401).json({
                message:
                    "Sai tài khoản hoặc mật khẩu."
            });
        }

        const token = createToken();

        sessions.set(
            token,
            user.id
        );

        res.json({
            success: true,
            token,
            userId: user.id,
            username: user.username,
            role:
                Number(user.is_admin) === 1
                    ? "admin"
                    : "user"
        });

    } catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );

        res.status(500).json({
            message: "Lỗi máy chủ."
        });
    }
});

// =====================================
// ĐĂNG XUẤT
// =====================================

app.post(
    "/api/logout",
    requireLogin,
    (req, res) => {

        const token = getToken(req);

        if (token) {
            sessions.delete(token);
        }

        res.json({
            success: true
        });
    }
);

// =====================================
// THÔNG TIN USER
// =====================================

app.get(
    "/api/me",
    requireLogin,
    (req, res) => {

        res.json({
            id: req.user.id,
            username: req.user.username,
            balance: req.user.balance,
            totalDeposit:
                req.user.total_deposit,
            totalSpent:
                req.user.total_spent,
            role:
                Number(req.user.is_admin) === 1
                    ? "admin"
                    : "user",
            createdAt:
                req.user.created_at
        });
    }
);

// =====================================
// LỊCH SỬ USER
// =====================================

app.get(
    "/api/history",
    requireLogin,
    (req, res) => {

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
    }
);

// =====================================
// USER GỬI YÊU CẦU NẠP TIỀN
// =====================================

app.post(
    "/api/deposits",
    requireLogin,
    (req, res) => {

        const amount =
            Number(req.body.amount);

        if (
            !Number.isFinite(amount) ||
            amount < 1000
        ) {
            return res.status(400).json({
                message:
                    "Số tiền tối thiểu 1.000đ."
            });
        }

        const money =
            Math.floor(amount);

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
            "Yêu cầu nạp tiền",
            money
        );

        res.json({
            success: true,
            message:
                "Đã gửi yêu cầu nạp tiền."
        });
    }
);

// =====================================
// USER MUA SẢN PHẨM
// =====================================

app.post(
    "/api/orders",
    requireLogin,
    (req, res) => {

        const product =
            String(
                req.body.product || ""
            ).trim();

        const price =
            Number(req.body.price);

        if (!product) {
            return res.status(400).json({
                message:
                    "Sản phẩm không hợp lệ."
            });
        }

        if (
            !Number.isFinite(price) ||
            price <= 0
        ) {
            return res.status(400).json({
                message:
                    "Giá sản phẩm không hợp lệ."
            });
        }

        const money =
            Math.floor(price);

        const currentUser =
            db.prepare(`
                SELECT balance
                FROM users
                WHERE id = ?
            `).get(req.user.id);

        if (!currentUser) {
            return res.status(404).json({
                message:
                    "Không tìm thấy tài khoản."
            });
        }

        if (currentUser.balance < money) {
            return res.status(400).json({
                message:
                    "Số dư không đủ."
            });
        }

        const transaction =
            db.transaction(() => {

                db.prepare(`
                    UPDATE users
                    SET
                        balance = balance - ?,
                        total_spent = total_spent + ?
                    WHERE id = ?
                `).run(
                    money,
                    money,
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
                    VALUES
                    (?, 'order', ?, ?, 'completed')
                `).run(
                    req.user.id,
                    "Mua " + product,
                    -money
                );
            });

        transaction();

        res.json({
            success: true,
            message:
                "Đặt hàng thành công."
        });
    }
);

// =====================================
// ADMIN - THỐNG KÊ
// =====================================

app.get(
    "/api/admin/stats",
    requireAdmin,
    (req, res) => {

        const users = db.prepare(`
            SELECT COUNT(*) AS count
            FROM users
        `).get().count;

        const pendingDeposits =
            db.prepare(`
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

        const money = db.prepare(`
            SELECT
                COALESCE(
                    SUM(amount),
                    0
                ) AS total
            FROM transactions
            WHERE type = 'deposit'
            AND status = 'approved'
        `).get().total;

        res.json({
            users,
            pendingDeposits,
            orders,
            money
        });
    }
);

// =====================================
// ADMIN - DANH SÁCH USER
// =====================================

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

// =====================================
// ADMIN - DANH SÁCH NẠP TIỀN
// =====================================

app.get(
    "/api/admin/deposits",
    requireAdmin,
    (req, res) => {

        const deposits = db.prepare(`
            SELECT
                t.id,
                t.user_id,
                u.username,
                t.amount,
                t.status,
                t.created_at
            FROM transactions t
            JOIN users u
                ON u.id = t.user_id
            WHERE t.type = 'deposit'
            ORDER BY t.id DESC
        `).all();

        res.json(deposits);
    }
);

// =====================================
// ADMIN - DUYỆT NẠP
// =====================================

app.post(
    "/api/admin/deposits/:id/approve",
    requireAdmin,
    (req, res) => {

        const depositId =
            Number(req.params.id);

        const deposit = db.prepare(`
            SELECT *
            FROM transactions
            WHERE id = ?
            AND type = 'deposit'
            AND status = 'pending'
        `).get(depositId);

        if (!deposit) {
            return res.status(404).json({
                message:
                    "Không tìm thấy yêu cầu nạp."
            });
        }

        const approve =
            db.transaction(() => {

                db.prepare(`
                    UPDATE users
                    SET
                        balance =
                            balance + ?,
                        total_deposit =
                            total_deposit + ?
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
                `).run(
                    depositId
                );
            });

        approve();

        res.json({
            success: true,
            message:
                "Đã duyệt nạp tiền."
        });
    }
);

// =====================================
// ADMIN - TỪ CHỐI NẠP
// =====================================

app.post(
    "/api/admin/deposits/:id/reject",
    requireAdmin,
    (req, res) => {

        const depositId =
            Number(req.params.id);

        const result = db.prepare(`
            UPDATE transactions
            SET status = 'rejected'
            WHERE id = ?
            AND type = 'deposit'
            AND status = 'pending'
        `).run(depositId);

        if (!result.changes) {
            return res.status(404).json({
                message:
                    "Không tìm thấy yêu cầu nạp."
            });
        }

        res.json({
            success: true,
            message:
                "Đã từ chối yêu cầu."
        });
    }
);

// =====================================
// ADMIN - CỘNG / TRỪ SỐ DƯ
// =====================================

app.post(
    "/api/admin/users/:id/balance",
    requireAdmin,
    (req, res) => {

        const userId =
            Number(req.params.id);

        const amount =
            Number(req.body.amount);

        if (!Number.isFinite(amount)) {
            return res.status(400).json({
                message:
                    "Số tiền không hợp lệ."
            });
        }

        const user = db.prepare(`
            SELECT id
            FROM users
            WHERE id = ?
        `).get(userId);

        if (!user) {
            return res.status(404).json({
                message:
                    "Không tìm thấy tài khoản."
            });
        }

        db.prepare(`
            UPDATE users
            SET balance = balance + ?
            WHERE id = ?
        `).run(
            Math.floor(amount),
            userId
        );

        res.json({
            success: true,
            message:
                "Đã cập nhật số dư."
        });
    }
);

// =====================================
// ADMIN - TẤT CẢ GIAO DỊCH
// =====================================

app.get(
    "/api/admin/transactions",
    requireAdmin,
    (req, res) => {

        const rows = db.prepare(`
            SELECT
                t.id,
                u.username,
                t.type,
                t.description,
                t.amount,
                t.status,
                t.created_at
            FROM transactions t
            JOIN users u
                ON u.id = t.user_id
            ORDER BY t.id DESC
            LIMIT 300
        `).all();

        res.json(rows);
    }
);

// =====================================
// START SERVER
// =====================================

(async () => {

    await setupAdmin();

    app.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                "================================="
            );

            console.log(
                "ADMIN HI STORE SERVER ONLINE"
            );

            console.log(
                `PORT: ${PORT}`
            );

            console.log(
                "ADMIN USERNAME: ADMIN"
            );

            console.log(
                "================================="
            );
        }
    );

})();
