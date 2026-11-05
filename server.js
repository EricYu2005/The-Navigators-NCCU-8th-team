/**
 * server.js
 * 後端核心伺服器 (Express.js)
 * 負責提供 API 接口給前端調用，並與 database.js 溝通
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const dbService = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中介軟體 (Middleware)
app.use(cors()); // 允許跨來源請求
app.use(express.json()); // 解析 JSON 格式的 Request Body
app.use(express.static(path.join(__dirname, 'public'))); // 提供前端靜態網頁檔案 (HTML, CSS, JS)

// ======================= API 路由定義 ======================= //

// 1. 取得所有記事/留言 (GET /api/notes)
app.get('/api/notes', async (req, res) => {
  try {
    const notes = await dbService.getAllNotes();
    res.json({ success: true, data: notes });
  } catch (error) {
    console.error('取得資料出錯:', error);
    res.status(500).json({ success: false, message: '伺服器讀取資料失敗' });
  }
});

// 2. 新增一筆記事/留言 (POST /api/notes)
app.post('/api/notes', async (req, res) => {
  try {
    const { title, content, author } = req.body;
    
    // 基本防呆驗證
    if (!title || !content) {
      return res.status(400).json({ success: false, message: '標題與內容為必填欄位！' });
    }

    const newNote = await dbService.createNote(title, content, author);
    res.status(201).json({ success: true, message: '新增成功！', data: newNote });
  } catch (error) {
    console.error('儲存資料出錯:', error);
    res.status(500).json({ success: false, message: '伺服器儲存資料失敗' });
  }
});

// 3. 刪除指定記事 (DELETE /api/notes/:id)
app.delete('/api/notes/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const result = await dbService.deleteNote(id);

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: '找不到欲刪除的項目' });
    }

    res.json({ success: true, message: '刪除成功！' });
  } catch (error) {
    console.error('刪除資料出錯:', error);
    res.status(500).json({ success: false, message: '伺服器刪除資料失敗' });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 伺服器正在運行中！`);
  console.log(`🌐 請在瀏覽器中開啟： http://localhost:${PORT}`);
  console.log(`===============================================`);
});
