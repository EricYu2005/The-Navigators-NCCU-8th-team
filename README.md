# 創創入門專案：團隊協作全端記憶看板 🚀

這是一個專門為**團隊協作**打造的初學者全端專案。透過串接 **SQLite 資料庫**，讓網頁擁有「記憶」功能，使用者填寫的靈感或任務紀錄會永久保存，重整頁面依然存在。

---

## 🛠️ 技術架構一覽

```
[前端瀏覽器 (HTML / CSS / JS)]
         │
         ▼  fetch() HTTP 請求 (GET / POST / DELETE)
[後端伺服器 (Node.js + Express.js)]
         │
         ▼  SQL 查詢語法
[輕量資料庫 (SQLite: data.db)]
```

* **前端 (Frontend)**: 原生 HTML5 + CSS3 + JavaScript，不需複雜打包工具即可直接調試。
* **後端 (Backend)**: Node.js + Express.js 提供 RESTful API 接口。
* **資料庫 (Database)**: SQLite，檔案型輕量資料庫（自動生成於 `data.db`），不需要自行額外架設龐大的資料庫伺服器。

---

## 📋 本地快速啟動指南

### 第一步：安裝 Node.js
如果電腦尚未安裝 Node.js，請至官方網站下載 **LTS 版本** 安裝：
👉 [Node.js 官方網站下載](https://nodejs.org/)

### 第二步：安裝專案相依套件
在專案根目錄開啟終端機（PowerShell 或 Terminal），執行：
```bash
npm install
```

### 第三步：啟動伺服器
```bash
npm start
```
伺服器啟動成功後，打開瀏覽器造訪：
👉 **http://localhost:3000**

*(若需要程式碼變更自動重啟，可執行 `npm run dev`)*

---

## 👥 GitHub 團隊協作實戰指南（新手必看 SOP）

為了讓你們組員在合作時不會互相蓋掉彼此的程式碼，請依循以下標準協作流程：

### 1. 建立遠端儲存庫 (GitHub Repository)
1. 由**專案組長**登入 [GitHub](https://github.com/) 點擊 **New repository**。
2. 專案設為 **Public** 或 **Private**（皆可）。
3. 進入該 Repo 的 **Settings -> Collaborators**，輸入組員的 GitHub 帳號並送出邀請。
4. 組員到自己的信箱收信接受邀請。

### 2. 將本專案推送至 GitHub
組長在專案目錄執行：
```bash
git init
git add .
git commit -m "feat: 初次提交，建立具備資料庫功能之專案骨幹"
git branch -M main
git remote add origin https://github.com/組長帳號/專案名稱.git
git push -u origin main
```

### 3. 組員下載專案 (Clone)
組員開啟終端機，執行：
```bash
git clone https://github.com/組長帳號/專案名稱.git
cd 專案名稱
npm install
npm start
```

### 4. 日常開發流程：永遠不要直接在 `main` 分支開發！
**黃金法則：一人一個分支（Branch），功能完成後再提 PR 合併。**

#### 步驟 A：每天開始寫扣前，先拉取最新程式碼
```bash
git checkout main
git pull origin main
```

#### 步驟 B：開立自己的新功能分支
```bash
# 例如組員 Alice 要做使用者登入或是修改 CSS 介面
git checkout -b feature/alice-ui-design
```

#### 步驟 C：修改程式碼、儲存並提交
```bash
git add .
git commit -m "style: 優化卡片陰影與送出按鈕視覺"
git push -u origin feature/alice-ui-design
```

#### 步驟 D：到 GitHub 提出 Pull Request (PR)
1. 開啟 GitHub 專案頁面，會看到綠色提示按鈕 **Compare & pull request**。
2. 寫下這次修改的內容，並邀請另一位組員 Review（檢查代碼）。
3. 確認無誤後點擊 **Merge pull request** 合併入 `main`。
4. 這樣就能保證主分支永遠是穩定可用的版本，完全避免檔案被覆蓋！

---

## 📁 檔案結構說明

```text
├── public/                 # 前端靜態資源目錄
│   ├── index.html          # 網頁結構與表單元件
│   ├── style.css           # 現代化響應式排版樣式
│   └── app.js              # 前端邏輯 (呼叫 API、動態渲染)
├── database.js             # SQLite 資料庫連線與 SQL 操作封裝
├── server.js               # Express 後端伺服器 (提供 RESTful API)
├── package.json            # 專案相依性套件與執行指令設定
├── .gitignore              # Git 忽略名單 (排除 node_modules 與 data.db)
├── .env.example            # 環境變數設定範例檔
└── README.md               # 專案說明與團隊協作規範
```

---

## 🚀 未來擴展建議

1. **雲端線上資料庫**：未來若要免費部署到網路上（如 Vercel 或 Render），可將 SQLite 升級為 **Supabase (免費 PostgreSQL 雲端服務)**。
2. **會員登入機制**：可加入 JWT 或 Session，讓每位使用者只能編輯或刪除自己建立的靈感。
3. **分類標籤與搜尋功能**：在資料表中新增 `category` 欄位，前端加入關鍵字過濾。
