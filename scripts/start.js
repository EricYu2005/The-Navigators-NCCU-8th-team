/**
 * scripts/start.js
 * CareNav 一鍵啟動啟動器 (Node.js 引擎，保證繁體中文無亂碼)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const MODULES_PATH = path.join(ROOT_DIR, 'node_modules');

console.clear();
console.log('====================================================');
console.log('       🚀 CareNav 智護領航 - 一鍵啟動精靈');
console.log('====================================================\n');

// 1. 檢查 .env
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(EXAMPLE_PATH)) {
    console.log('⚙️ 偵測到尚未建立本地設定檔，正在從 .env.example 生成 .env ...');
    fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
    console.log('✅ 已自動生成本機專用 .env 設定檔。\n');
  }
}

// 2. 檢查 node_modules
if (!fs.existsSync(MODULES_PATH)) {
  console.log('📦 首次執行或缺少相依套件，正在為您自動執行 npm install ...');
  console.log('（首次安裝約需 1 分鐘，請稍候...）\n');
  try {
    execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\n✅ 相依套件安裝完成！\n');
  } catch (err) {
    console.error('❌ 套件安裝失敗，請檢查網路連線。');
    process.exit(1);
  }
}

// 3. 自動在瀏覽器開啟網頁 (延遲 1.5 秒)
setTimeout(() => {
  try {
    const startCmd = process.platform === 'win32' ? 'start http://localhost:3000' : 'open http://localhost:3000';
    execSync(startCmd, { stdio: 'ignore' });
  } catch (e) {}
}, 1500);

// 4. 啟動伺服器
console.log('🌐 正在啟動後端伺服器與 SQLite 資料庫...');
console.log('💡 預設瀏覽器將自動開啟： http://localhost:3000');
console.log('\n【提示】若要停止伺服器，請直接關閉此視窗或按下 Ctrl + C。');
console.log('====================================================\n');

const serverProcess = spawn('node', ['server.js'], { cwd: ROOT_DIR, stdio: 'inherit' });
serverProcess.on('exit', (code) => {
  console.log(`\n伺服器已結束 (代碼: ${code})。`);
});
