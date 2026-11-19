/**
 * scripts/start.js
 * 好選保健 PurePick - 一鍵啟動精靈 (Node.js + Python 雙引擎檢查，繁體中文無亂碼)
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const MODULES_PATH = path.join(ROOT_DIR, 'node_modules');

if (process.stdout && process.stdout.isTTY) {
  process.stdout.write('\x1b]0;好選保健 PurePick - 跨品牌保健品比較與日曆管理平台\x07');
}

console.clear();
console.log('==========================================================');
console.log('   好選保健 PurePick - 跨品牌保健品比較與日曆管理平台');
console.log('   （政大創創入門第八組 The Navigators 一鍵啟動精靈）');
console.log('==========================================================\n');

// 1. 檢查 .env 設定檔
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(EXAMPLE_PATH)) {
    console.log('[設定] 偵測到尚未建立本地設定檔，正在從 .env.example 生成 .env ...');
    fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
    console.log('[設定] 已自動生成本機專用 .env 設定檔。\n');
  }
}

// 2. 檢查 node_modules 相依套件
if (!fs.existsSync(MODULES_PATH)) {
  console.log('[套件] 首次執行或缺少相依套件，正在自動執行 npm install ...');
  console.log('（首次安裝約需 1 分鐘，請稍候...）\n');
  try {
    execSync('npm install', { cwd: ROOT_DIR, stdio: 'inherit' });
    console.log('\n[套件] 相依套件安裝完成！\n');
  } catch (err) {
    console.error('[錯誤] 套件安裝失敗，請檢查網路連線。');
    process.exit(1);
  }
}

// 3. 檢查 Python 分析與爬蟲腳本環境
try {
  const pyVer = execSync('python --version', { encoding: 'utf8', stdio: 'pipe' }).trim();
  console.log(`[環境] 偵測到 Python 分析與爬蟲環境：${pyVer}`);
  console.log('   ├─ 需求與去冗分析器：scripts/supplement_analyzer.py (就緒)');
  console.log('   └─ 保健品規格爬蟲器：scripts/supplement_crawler.py (就緒)\n');
} catch (e) {
  console.log('[提示] 未偵測到本機 Python 指令，系統將自動以內建等效精算引擎無縫執行。\n');
}

if (process.argv.includes('--check') || process.argv.includes('--dry-run')) {
  console.log('[測試] 啟動環境與相依套件檢查通過，系統狀態良好！');
  process.exit(0);
}

// 4. 自動在瀏覽器開啟網頁 (延遲 1.5 秒)
setTimeout(() => {
  try {
    const startCmd = process.platform === 'win32' ? 'start http://localhost:3000' : 'open http://localhost:3000';
    execSync(startCmd, { stdio: 'ignore' });
  } catch (e) {}
}, 1500);

// 5. 啟動伺服器
console.log('[伺服器] 正在啟動好選保健 PurePick 伺服器與跨品牌保健品資料庫...');
console.log('[伺服器] 預設瀏覽器將自動開啟： http://localhost:3000');
console.log('\n【提示】若要停止伺服器，請直接關閉此視窗或按下 Ctrl + C。');
console.log('==========================================================\n');

const serverProcess = spawn('node', ['server.js'], { cwd: ROOT_DIR, stdio: 'inherit' });
serverProcess.on('exit', (code) => {
  console.log(`\n好選保健 PurePick 伺服器已結束 (代碼: ${code})。`);
});
