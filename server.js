const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Cho phép truy cập index.html và các file khác
app.use(express.static(path.join(__dirname)));

app.get("/healthz", (req, res) => {
  res.status(200).send("OK");
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
