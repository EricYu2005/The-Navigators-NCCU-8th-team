/**
 * scripts/sync.js
 * 好選保健 PurePick - 團隊進度同步、保健品資料庫重置與機密管理中心 (sync.cmd)
 */

const readline = require('readline');
const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');
const ENV_PATH = path.join(ROOT_DIR, '.env');
const EXAMPLE_PATH = path.join(ROOT_DIR, '.env.example');
const VAULT_PATH = path.join(ROOT_DIR, 'secrets.vault');

function runCmd(command, options = {}) {
  try {
    return execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: options.stdio || 'pipe',
      ...options
    });
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

function runInteractiveCmd(command) {
  try {
    spawnSync(command, { cwd: ROOT_DIR, stdio: 'inherit', shell: true });
    return true;
  } catch (err) {
    console.error('執行失敗:', err.message);
    return false;
  }
}

function getCurrentBranch() {
  const branch = runCmd('git branch --show-current', { ignoreError: true });
  return (branch && branch.trim()) || 'main';
}

function deriveKey(password) {
  return crypto.createHash('sha256').update(password).digest();
}

function encryptText(text, password) {
  const key = deriveKey(password);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptText(cipherText, password) {
  const parts = cipherText.trim().split(':');
  if (parts.length !== 2) throw new Error('密文格式不符');
  const iv = Buffer.from(parts[0], 'hex');
  const key = deriveKey(password);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(parts[1], 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function ask(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function waitKeyPress() {
  return ask('\n請按 Enter 鍵繼續...');
}

function showSecretStatus() {
  console.log('----------------------------------------------------------------');
  console.log('[本機機密設定狀態 (.env)]');
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8')
      .split(/\r?\n/)
      .filter(l => l.includes('=') && !l.trim().startsWith('#'));
    console.log('本機已存在 .env 設定檔，包含項目：');
    lines.forEach(l => console.log('   • ' + l.split('=')[0]));
  } else {
    console.log('本機尚未建立 .env 設定檔（可於選單 [4] 進行編輯或自組員處匯入）');
  }
  console.log('----------------------------------------------------------------\n');
}

async function showMainMenu() {
  console.clear();
  console.log('================================================================');
  console.log('   好選保健 PurePick｜團隊進度同步與雲端管理中心 (sync.cmd)');
  console.log('   （政大創創入門第八組 The Navigators 跨品牌保健品比較平台）');
  console.log('================================================================\n');

  const branch = getCurrentBranch();
  showSecretStatus();

  console.log(`目前所在 Git 分支：[${branch}]\n`);
  console.log('請選擇要執行的功能：');
  console.log('  [1] 一鍵全自動同步 (拉取最新進度 + 自動更新套件 + 推送我的成果)');
  console.log('  [2] 僅拉取最新代碼 (Pull：下載組員進度 + 套件同步)');
  console.log('  [3] 僅推送我的進度 (Push：將本地修改提交至 GitHub 與 Render)');
  console.log('  [4] 機密資訊管理中心 (.env 編輯 / 加密匯出 / 解密同步)');
  console.log('  [5] 重新初始化本地保健品比價資料庫與日曆示範資料');
  console.log('  [6] Git 衝突急救與狀態診斷');
  console.log('  [7] 匯出名單為 Excel 試算表檔案 (列印 leads 名單並即時開啟)');
  console.log('  [0] 離開\n');
  console.log('================================================================');

  const choice = await ask('請輸入選項號碼 (1-7, 0): ');

  switch (choice) {
    case '1':
      await handleAutoSync(branch);
      break;
    case '2':
      await handlePullOnly(branch);
      break;
    case '3':
      await handlePushOnly(branch);
      break;
    case '4':
      await handleSecretsCenter();
      break;
    case '5':
      await handleResetSupplementDb();
      break;
    case '6':
      await handleGitDoctor();
      break;
    case '7':
      await handleViewLeads();
      break;
    case '0':
      console.log('\n感謝使用好選保健 PurePick 團隊同步工具，祝專題報告順利！\n');
      process.exit(0);
      break;
    default:
      console.log('輸入錯誤，請重新輸入。');
      await waitKeyPress();
      break;
  }

  await showMainMenu();
}

async function handleAutoSync(branch) {
  console.log('\n================================================================');
  console.log('[步驟 1/3] 正在從 GitHub 拉取組員的最新成果...');
  console.log('================================================================');
  try {
    runInteractiveCmd(`git pull origin ${branch}`);
  } catch (e) {
    console.log('拉取可能遇到衝突，建議返回主選單選擇 [6] 衝突急救。');
    await waitKeyPress();
    return;
  }

  console.log('\n[步驟 2/3] 檢查相依套件庫...');
  if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules'))) {
    console.log('偵測到缺少 node_modules，正在自動執行 npm install...');
    runInteractiveCmd('npm install');
  } else {
    console.log('套件庫狀態正常。');
  }

  console.log('\n[步驟 3/3] 檢查本地是否有修改需要推送...');
  const status = runCmd('git status -s', { ignoreError: true });
  if (!status || !status.trim()) {
    console.log('本地工作區非常乾淨，沒有尚未提交的修改。全自動同步完成！');
    await waitKeyPress();
    return;
  }

  console.log('本次變更檔案清單：\n' + status);
  const commitMsg = await ask('請輸入本次修改說明 (直接按 Enter 將跳過推送): ');
  if (!commitMsg) {
    console.log('已略過推送步驟。');
    await waitKeyPress();
    return;
  }

  runCmd('git add .');
  runCmd('git reset HEAD .env secrets.vault data.db gcp-key.json', { ignoreError: true });
  runCmd(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

  console.log(`\n正在推送至 GitHub (${branch})，Render 將自動觸發雲端部署...`);
  runInteractiveCmd(`git push origin ${branch}`);

  console.log('\n一鍵全自動同步圓滿完成！');
  await waitKeyPress();
}

async function handlePullOnly(branch) {
  console.log('\n正在從 GitHub 拉取最新進度...');
  runInteractiveCmd(`git pull origin ${branch}`);
  console.log('\n檢查相依套件...');
  runInteractiveCmd('npm install');
  console.log('\n拉取與套件同步完成！');
  await waitKeyPress();
}

async function handlePushOnly(branch) {
  console.log('\n正在檢查本地變更檔案...');
  const status = runCmd('git status -s', { ignoreError: true });
  if (!status || !status.trim()) {
    console.log('目前沒有偵測到任何修改檔案！');
    await waitKeyPress();
    return;
  }

  console.log('異動清單：\n' + status);
  let commitMsg = await ask('請輸入本次修改說明 (例: 新增跨品牌保健品比價資料與UI調整): ');
  if (!commitMsg) commitMsg = 'chore: 更新好選保健平台功能與介面';

  runCmd('git add .');
  runCmd('git reset HEAD .env secrets.vault data.db gcp-key.json', { ignoreError: true });
  runCmd(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`);

  console.log(`\n正在推送至 GitHub (${branch})...`);
  runInteractiveCmd(`git push origin ${branch}`);
  console.log('\n您的代碼已成功推送到 GitHub，Render 雲端將自動更新部署！');
  await waitKeyPress();
}

async function handleResetSupplementDb() {
  console.log('\n正在重新載入 24 款跨品牌保健品資料、有興趣清單與服用日曆預設值...');
  try {
    const { restoreDemoData } = require('../database');
    await restoreDemoData();
    console.log('本地保健品比價資料庫 (data.db) 已成功重置為最新完整狀態！');
  } catch (err) {
    console.error('重置資料庫失敗:', err.message);
  }
  await waitKeyPress();
}

async function handleSecretsCenter() {
  while (true) {
    console.clear();
    console.log('================================================================');
    console.log('       好選保健 PurePick｜機密資訊管理中心 (.env)');
    console.log('================================================================\n');
    console.log('什麼是機密資訊？');
    console.log('• 本地的 .env 檔案（包含 Gemini / Groq API Key、LINE Login 憑證等）');
    console.log('• 這些資訊絕對不能直接推送到 GitHub 公開！');
    console.log('• 透過本工具，您可以將機密安全加密，生成密文在 LINE/Discord 分享！\n');

    console.log('請選擇機密操作：');
    console.log('  [1] 編輯本機 .env 設定檔 (使用記事本開啟)');
    console.log('  [2] 匯出加密機密包 (設定密碼，產生團隊分享密文字串)');
    console.log('  [3] 匯入團隊機密包 (貼上密文並輸入密碼，一秒同步 .env)');
    console.log('  [4] 自動更新 .env.example 公開範本 (遮蔽數值後供 GitHub 參考)');
    console.log('  [0] 返回主選單\n');
    console.log('================================================================');

    const subChoice = await ask('請輸入選項 (1-4, 0): ');

    if (subChoice === '1') {
      if (!fs.existsSync(ENV_PATH)) {
        if (fs.existsSync(EXAMPLE_PATH)) {
          fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
        } else {
          fs.writeFileSync(ENV_PATH, 'PORT=3000\nNODE_ENV=development\nGEMINI_API_KEY=\nLINE_CHANNEL_ID=\nLINE_CHANNEL_SECRET=\n', 'utf8');
        }
      }
      console.log('\n正在為您開啟 .env 設定檔...');
      runInteractiveCmd(`notepad.exe "${ENV_PATH}"`);
    } else if (subChoice === '2') {
      if (!fs.existsSync(ENV_PATH)) {
        console.log('\n找不到本機 .env 檔案，請先選 [1] 建立！');
        await waitKeyPress();
        continue;
      }
      const pwd = await ask('\n請設定團隊通關密碼 (需告訴組員以利解密): ');
      if (!pwd) {
        console.log('密碼不得為空！');
        await waitKeyPress();
        continue;
      }
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      const encrypted = encryptText(content, pwd);
      fs.writeFileSync(VAULT_PATH, encrypted, 'utf8');

      console.log('\n===============================================================');
      console.log('團隊機密安全加密字串 (AES-256 加密)：');
      console.log(encrypted);
      console.log('===============================================================');
      console.log('已成功將本機 .env 加密打包為安全密文，並存於 secrets.vault！\n');
      await waitKeyPress();
    } else if (subChoice === '3') {
      const pwd = await ask('\n請輸入團隊通關密碼: ');
      let cipher = await ask('請貼上組員傳來的加密字串 (若留空則嘗試從本地 secrets.vault 載入): ');
      if (!cipher && fs.existsSync(VAULT_PATH)) {
        cipher = fs.readFileSync(VAULT_PATH, 'utf8');
      }
      if (!pwd || !cipher) {
        console.log('密碼與密文不能為空！');
        await waitKeyPress();
        continue;
      }
      try {
        const decrypted = decryptText(cipher, pwd);
        fs.writeFileSync(ENV_PATH, decrypted, 'utf8');
        console.log('\n解密成功！已將機密資訊同步寫入本機 .env 檔案！');
      } catch (err) {
        console.log('\n解密失敗：密碼錯誤或密文損毀！');
      }
      await waitKeyPress();
    } else if (subChoice === '4') {
      if (!fs.existsSync(ENV_PATH)) {
        console.log('\n找不到 .env 檔案！');
        await waitKeyPress();
        continue;
      }
      const envContent = fs.readFileSync(ENV_PATH, 'utf8');
      const sanitized = envContent.split(/\r?\n/).map(line => {
        if (line.trim().startsWith('#') || !line.includes('=')) return line;
        return line.split('=')[0] + '=';
      }).join('\n');
      fs.writeFileSync(EXAMPLE_PATH, sanitized, 'utf8');
      console.log('\n.env.example 公開範本檔已同步更新（所有數值皆已遮蔽）！');
      await waitKeyPress();
    } else if (subChoice === '0') {
      break;
    }
  }
}

async function handleGitDoctor() {
  console.log('\n================================================================');
  console.log('Git 狀態診斷報告：');
  console.log('================================================================');
  runInteractiveCmd('git status');
  console.log('\n急救選項：');
  console.log('  [1] 取消目前的 Merge / Rebase 衝突 (恢復到安全狀態)');
  console.log('  [2] 強制刪除卡住的 Git Lock 檔案 (.git/index.lock)');
  console.log('  [0] 返回主選單\n');

  const opt = await ask('請選擇 (1, 2, 0): ');
  if (opt === '1') {
    runCmd('git merge --abort', { ignoreError: true });
    runCmd('git rebase --abort', { ignoreError: true });
    console.log('已取消衝突狀態，回到乾淨工作區。');
  } else if (opt === '2') {
    const lockPath = path.join(ROOT_DIR, '.git', 'index.lock');
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
      console.log('已清除 index.lock 鎖定檔。');
    } else {
      console.log('目前沒有殘留的 index.lock。');
    }
  }
  await waitKeyPress();
}

async function handleViewLeads() {
  console.log('\n================================================================');
  console.log('   好選保健 PurePick｜匯出潛在消費者名單為 Excel 試算表 (.csv)');
  console.log('================================================================\n');
  try {
    const { dbQuery } = require('../database');
    const rows = await dbQuery.all('SELECT * FROM leads ORDER BY id DESC');
    console.log(`目前資料庫名單總計：${rows.length} 筆\n`);

    if (rows.length === 0) {
      console.log('目前尚無名單登記記錄。可透過網頁索取報告或預約表單進行登記！');
    } else {
      // 1. 在控制台列印預覽
      rows.slice(0, 5).forEach((r, idx) => {
        console.log(`[${idx + 1}] 時間: ${r.created_at} | 稱呼: ${r.name}`);
        console.log(`    聯絡: [${r.contact_type}] ${r.contact_value}`);
        console.log(`    面向: ${r.health_goal || '無'} | 預算: ${r.monthly_budget || '無'} | 來源: ${r.source}`);
        if (r.note) console.log(`    備註: ${r.note}`);
        console.log('----------------------------------------------------------------');
      });
      if (rows.length > 5) {
        console.log(`... 另有 ${rows.length - 5} 筆記錄，已全數寫入 Excel 檔案中。\n`);
      }

      // 2. 匯出為 Excel 相容的 UTF-8 with BOM CSV 檔案 (Excel 開啟 100% 不亂碼)
      const escapeCsv = (val) => {
        if (val === null || val === undefined) return '""';
        return '"' + String(val).replace(/"/g, '""').replace(/\r?\n/g, ' ') + '"';
      };

      const header = [
        '登記序號',
        '登記時間',
        '消費者稱呼',
        '年齡區間',
        '電子信箱',
        '流程順暢度評分 (1~5分)',
        '來源管道標籤',
        '諮詢問題與回饋建議'
      ].map(escapeCsv).join(',');

      const lines = rows.map(r => [
        escapeCsv(r.id),
        escapeCsv(r.created_at),
        escapeCsv(r.name),
        escapeCsv(r.age || '未提供'),
        escapeCsv(r.contact_value),
        escapeCsv(r.satisfaction_score ? `${r.satisfaction_score} 分` : '5 分'),
        escapeCsv(r.source),
        escapeCsv(r.note)
      ].join(','));

      const csvContent = '\uFEFF' + [header, ...lines].join('\r\n');
      const nowStr = new Date().toISOString().slice(0, 10);
      const fileName = `PurePick_消費者登記名單_${nowStr}.csv`;
      const exportPath = path.join(ROOT_DIR, fileName);

      fs.writeFileSync(exportPath, csvContent, 'utf8');

      console.log(`\n================================================================`);
      console.log(`[成功] 已將 ${rows.length} 筆名單成功列印匯出為 Excel 檔案！`);
      console.log(`檔案儲存位置：${exportPath}`);
      console.log(`================================================================\n`);

      // 3. 自動嘗試調用系統預設的 Excel / 試算表軟體開啟
      try {
        runInteractiveCmd(`start "" "${exportPath}"`);
        console.log('已自動為您呼叫 Excel / 試算表軟體開啟名單！');
      } catch (e) {
        console.log('可手動至專案根目錄開啟該檔案。');
      }
    }
  } catch (err) {
    console.error('匯出名單失敗:', err.message);
  }
  await waitKeyPress();
}

showMainMenu();
