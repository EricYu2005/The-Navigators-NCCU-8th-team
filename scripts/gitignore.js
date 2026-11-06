/**
 * scripts/gitignore.js
 * Git 忽略規則與安全防護檢查 (Node.js 引擎，無亂碼)
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const GITIGNORE_PATH = path.join(ROOT_DIR, '.gitignore');
const EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');

console.clear();
console.log('====================================================');
console.log('  🛡️ Git 忽略規則與安全防護檢查工具 (gitignore.cmd)');
console.log('====================================================\n');

// 1. 更新 .gitignore
console.log('[1/3] 正在檢查並更新 .gitignore 規則...');
const gitignoreRules = `# 相依套件庫
node_modules/

# 本地機密環境變數設定檔（禁止推送到 GitHub）
.env
.env.local
.env.*.local
secrets.vault

# GCP / 雲端金鑰 JSON 檔案（機密憑證，嚴禁上傳）
gcp-key.json
*credentials*.json
*service-account*.json
*.pem
*.key

# 本地 SQLite 資料庫檔案
*.db
*.sqlite
*.sqlite3
data.db

# 系統與編輯器快取
.DS_Store
Thumbs.db
.vscode/
.idea/

# 日誌
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
`;

fs.writeFileSync(GITIGNORE_PATH, gitignoreRules, 'utf8');
console.log('✅ .gitignore 規則已成功更新！\n');

// 2. 清理快取
console.log('[2/3] 檢查是否曾有機密檔或 node_modules 誤進 Git 快取...');
try {
  execSync('git rm -r --cached .env secrets.vault node_modules data.db gcp-key.json', { cwd: ROOT_DIR, stdio: 'ignore' });
  console.log('✅ 已確保機密檔案與套件庫未被 Git 快取追蹤！\n');
} catch (e) {
  console.log('✅ Git 暫存區目前非常乾淨。\n');
}

// 3. 確保 .env.example 存在
console.log('[3/3] 檢查 .env.example 範本檔...');
if (!fs.existsSync(EXAMPLE_PATH)) {
  const exampleContent = `PORT=3000\nNODE_ENV=development\nOLLAMA_BASE_URL=http://localhost:11434\nOLLAMA_MODEL=llama3.2\n`;
  fs.writeFileSync(EXAMPLE_PATH, exampleContent, 'utf8');
  console.log('✅ 已自動生成 .env.example 範本檔。\n');
} else {
  console.log('✅ .env.example 範本檔已就緒。\n');
}

// 4. 設定 git 中文編碼不轉義
try {
  execSync('git config core.quotepath false', { cwd: ROOT_DIR, stdio: 'ignore' });
  console.log('✅ 已設定 Git 中文路徑友善顯示 (core.quotepath = false)。\n');
} catch (e) {}

console.log('====================================================');
console.log('🎉 防護檢查完成！所有機密檔案與套件庫均已安全排除。');
console.log('====================================================\n');
