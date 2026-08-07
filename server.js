const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

// =============================================
// 1. HÀM ĐỌC/GHI DỮ LIỆU
// =============================================
function readData() {
  try {
    const data = fs.readFileSync('db.json', 'utf8');
    return JSON.parse(data);
  } catch {
    // Nếu chưa có file, tạo mới
    const defaultData = {
      users: [
        { username: 'Admin', password: 'Phc51580', role: 'admin', balance: 0, voucherUsed: false }
      ],
      pendingOrders: [],
      pendingNap: [],
      history: [],
      orderCounter: 1,
      napCounter: 1
    };
    writeData(defaultData);
    return defaultData;
  }
}

function writeData(data) {
  fs.writeFileSync('db.json', JSON.stringify(data, null, 2));
}

// =============================================
// 2. API LẤY DỮ LIỆU
// =============================================
app.get('/api/all', (req, res) => {
  const data = readData();
  res.json(data);
});

app.get('/api/users', (req, res) => {
  const data = readData();
  res.json(data.users);
});

app.get('/api/nap', (req, res) => {
  const data = readData();
  res.json(data.pendingNap);
});

app.get('/api/orders', (req, res) => {
  const data = readData();
  res.json(data.pendingOrders);
});

app.get('/api/history', (req, res) => {
  const data = readData();
  res.json(data.history);
});

// =============================================
// 3. API ĐỒNG BỘ DỮ LIỆU
// =============================================
app.post('/api/sync', (req, res) => {
  const data = req.body;
  writeData(data);
  res.json({ success: true });
});

// =============================================
// 4. API NẠP TIỀN
// =============================================
app.post('/api/nap', (req, res) => {
  const data = readData();
  const newNap = {
    id: data.napCounter++,
    amount: req.body.amount,
    user: req.body.user,
    date: new Date().toLocaleString('vi-VN'),
    status: 'pending',
    code: req.body.code || 'NAP-' + Math.random().toString(36).substring(2, 8).toUpperCase()
  };
  data.pendingNap.push(newNap);
  
  // Thêm vào lịch sử
  data.history.push({
    type: 'Nạp tiền (chờ duyệt)',
    product: '',
    amount: req.body.amount,
    date: new Date().toLocaleString('vi-VN'),
    status: 'pending'
  });
  
  writeData(data);
  res.json({ success: true, nap: newNap });
});

// =============================================
// 5. API DUYỆT NẠP TIỀN
// =============================================
app.post('/api/approve-nap', (req, res) => {
  const data = readData();
  const nap = data.pendingNap.find(n => n.id === req.body.id);
  
  if (!nap) {
    return res.json({ success: false, error: 'Không tìm thấy yêu cầu' });
  }
  
  nap.status = 'approved';
  
  // Cộng tiền cho user
  const user = data.users.find(u => u.username === nap.user);
  if (user) {
    user.balance = (user.balance || 0) + nap.amount;
  }
  
  // Cập nhật lịch sử
  const historyItem = data.history.find(h => 
    h.type === 'Nạp tiền (chờ duyệt)' && 
    h.amount === nap.amount && 
    h.status === 'pending'
  );
  if (historyItem) {
    historyItem.status = 'approved';
  }
  
  writeData(data);
  res.json({ success: true });
});

// =============================================
// 6. API HỦY NẠP TIỀN
// =============================================
app.post('/api/cancel-nap', (req, res) => {
  const data = readData();
  const nap = data.pendingNap.find(n => n.id === req.body.id);
  
  if (!nap) {
    return res.json({ success: false, error: 'Không tìm thấy yêu cầu' });
  }
  
  nap.status = 'cancelled';
  
  // Cập nhật lịch sử
  const historyItem = data.history.find(h => 
    h.type === 'Nạp tiền (chờ duyệt)' && 
    h.amount === nap.amount && 
    h.status === 'pending'
  );
  if (historyItem) {
    historyItem.status = 'cancelled';
  }
  
  writeData(data);
  res.json({ success: true });
});

// =============================================
// 7. API MUA HÀNG
// =============================================
app.post('/api/buy', (req, res) => {
  const data = readData();
  
  const newOrder = {
    id: data.orderCounter++,
    product: req.body.product,
    price: req.body.price,
    user: req.body.user,
    date: new Date().toLocaleString('vi-VN'),
    status: 'pending',
    key: null,
    voucherUsed: req.body.voucherUsed || false
  };
  data.pendingOrders.push(newOrder);
  
  // Trừ tiền user
  const user = data.users.find(u => u.username === req.body.user);
  if (user) {
    user.balance = (user.balance || 0) - req.body.price;
    if (req.body.voucherUsed) {
      user.voucherUsed = true;
    }
  }
  
  // Thêm lịch sử
  data.history.push({
    type: 'Mua key (chờ duyệt)',
    product: req.body.product,
    amount: -req.body.price,
    date: new Date().toLocaleString('vi-VN'),
    status: 'pending',
    key: null,
    voucherUsed: req.body.voucherUsed || false,
    discount: req.body.voucherUsed ? '20%' : '0%'
  });
  
  writeData(data);
  res.json({ success: true, order: newOrder });
});

// =============================================
// 8. API DUYỆT ĐƠN HÀNG
// =============================================
app.post('/api/approve-order', (req, res) => {
  const data = readData();
  const order = data.pendingOrders.find(o => o.id === req.body.id);
  
  if (!order) {
    return res.json({ success: false, error: 'Không tìm thấy đơn hàng' });
  }
  
  order.status = 'delivered';
  order.key = req.body.key;
  
  // Cập nhật lịch sử
  const historyItem = data.history.find(h => 
    h.type === 'Mua key (chờ duyệt)' && 
    h.product === order.product && 
    h.amount === -order.price
  );
  if (historyItem) {
    historyItem.status = 'delivered';
    historyItem.key = req.body.key;
  }
  
  writeData(data);
  res.json({ success: true });
});

// =============================================
// 9. API CỘNG/TRỪ TIỀN USER (Admin)
// =============================================
app.post('/api/update-balance', (req, res) => {
  const data = readData();
  const user = data.users.find(u => u.username === req.body.username);
  
  if (!user) {
    return res.json({ success: false, error: 'Không tìm thấy user' });
  }
  
  user.balance = (user.balance || 0) + req.body.amount;
  writeData(data);
  res.json({ success: true, balance: user.balance });
});

// =============================================
// 10. API ĐĂNG KÝ
// =============================================
app.post('/api/register', (req, res) => {
  const data = readData();
  const existing = data.users.find(u => u.username === req.body.username);
  
  if (existing) {
    return res.json({ success: false, error: 'Tên đăng nhập đã tồn tại' });
  }
  
  data.users.push({
    username: req.body.username,
    password: req.body.password,
    role: 'user',
    balance: 0,
    voucherUsed: false
  });
  
  writeData(data);
  res.json({ success: true });
});

// =============================================
// 11. API ĐĂNG NHẬP
// =============================================
app.post('/api/login', (req, res) => {
  const data = readData();
  const user = data.users.find(u => 
    u.username === req.body.username && 
    u.password === req.body.password
  );
  
  if (!user) {
    return res.json({ success: false, error: 'Sai tên đăng nhập hoặc mật khẩu' });
  }
  
  res.json({ 
    success: true, 
    user: {
      username: user.username,
      role: user.role,
      balance: user.balance || 0,
      voucherUsed: user.voucherUsed || false
    }
  });
});

// =============================================
// 12. API ĐỒNG BỘ TOÀN BỘ (Dùng cho lần đầu)
// =============================================
app.post('/api/init', (req, res) => {
  const data = req.body;
  writeData(data);
  res.json({ success: true });
});

// =============================================
// CHẠY SERVER
// =============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Server đang chạy tại port ${PORT}`);
  console.log(`🔗 API: http://localhost:${PORT}/api/all`);
  console.log('🔑 Admin: Admin / Phc51580');
});
