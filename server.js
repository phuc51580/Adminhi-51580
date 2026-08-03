const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Cho phép server hiển thị index.html
app.use(express.static(path.join(__dirname)));

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "Adminhi Store API đang hoạt động"
  });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Adminhi Store đang chạy tại port ${PORT}`);
});
