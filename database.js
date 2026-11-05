/**
 * database.js
 * 資料庫模組：使用 SQLite 本地輕量級資料庫
 * 
 * 優點：
 * 1. 不需要額外安裝 MySQL/PostgreSQL 伺服器軟體，開箱即用
 * 2. 資料會保存在本機的 data.db 檔案中，伺服器重開後資料依然在（擁有記憶功能）
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// 設定資料庫檔案路徑（存放在專案根目錄下的 data.db）
const DB_PATH = path.resolve(__dirname, 'data.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 無法連線至 SQLite 資料庫:', err.message);
  } else {
    console.log('✅ 已成功連線至 SQLite 資料庫:', DB_PATH);
    initDatabase();
  }
});

// 初始化資料庫表格：如果表格不存在則自動建立
function initDatabase() {
  const sql = `
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author TEXT DEFAULT '訪客',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(sql, (err) => {
    if (err) {
      console.error('❌ 初始化資料表失敗:', err.message);
    } else {
      console.log('✅ 資料表 (notes) 已準備就緒');
    }
  });
}

// 封裝成 Promise 方便在 server.js 中使用 async/await
const dbService = {
  // 1. 取得所有紀錄
  getAllNotes: () => {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM notes ORDER BY created_at DESC';
      db.all(sql, [], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },

  // 2. 新增一筆紀錄
  createNote: (title, content, author) => {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO notes (title, content, author) VALUES (?, ?, ?)';
      db.run(sql, [title, content, author || '匿名'], function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, title, content, author });
      });
    });
  },

  // 3. 刪除指定 ID 的紀錄
  deleteNote: (id) => {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM notes WHERE id = ?';
      db.run(sql, [id], function (err) {
        if (err) reject(err);
        else resolve({ affectedRows: this.changes });
      });
    });
  }
};

module.exports = dbService;
