/**
 * scripts/secrets.js
 * CareNav 團隊機密安全同步核心 (AES-256 加解密引擎)
 * 供 sync.cmd 呼叫，實現真正的「全組同步與儲存機密資訊」
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ENV_PATH = path.resolve(__dirname, '..', '.env');
const EXAMPLE_PATH = path.resolve(__dirname, '..', '.env.example');
const VAULT_PATH = path.resolve(__dirname, '..', 'secrets.vault');

function deriveKey(password) {
  return crypto.createHash('sha256').update(password).digest();
}

function encrypt(text, password) {
  const key = deriveKey(password);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(cipherText, password) {
  const parts = cipherText.trim().split(':');
  if (parts.length !== 2) throw new Error('密文格式不正確');
  const iv = Buffer.from(parts[0], 'hex');
  const encryptedText = parts[1];
  const key = deriveKey(password);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encryptedText, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

const action = process.argv[2];

switch (action) {
  case 'status': {
    console.log('\n===============================================');
    console.log('🔍 [本機機密狀態檢查 (.env)]');
    if (fs.existsSync(ENV_PATH)) {
      const content = fs.readFileSync(ENV_PATH, 'utf8');
      const lines = content.split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'));
      console.log('✅ 本機已存在 .env 設定檔，包含以下項目：');
      lines.forEach(l => console.log('   • ' + l.split('=')[0]));
    } else {
      console.log('⚠️ 本機尚未建立 .env 設定檔');
    }
    console.log('===============================================\n');
    break;
  }

  case 'export': {
    const password = process.argv[3];
    if (!password) {
      console.error('❌ 請提供團隊自訂通關密碼');
      process.exit(1);
    }
    if (!fs.existsSync(ENV_PATH)) {
      console.error('❌ 找不到本機 .env 檔案');
      process.exit(1);
    }
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const encrypted = encrypt(envContent, password);
    fs.writeFileSync(VAULT_PATH, encrypted, 'utf8');

    console.log('\n===============================================================');
    console.log('🔐 團隊機密安全加密字串 (AES-256 加密)：');
    console.log(encrypted);
    console.log('===============================================================');
    console.log('✅ 已成功將本機 .env 加密打包為安全密文，並存於 secrets.vault！');
    console.log('💡 團隊同步方式：');
    console.log('   將上方這段密文直接傳在 LINE/Discord 群組，組員透過 sync.cmd');
    console.log('   選擇匯入並輸入同一組密碼，即可一秒同步所有機密設定！\n');
    break;
  }

  case 'import': {
    const password = process.argv[3];
    let cipherText = process.argv[4];

    if (!cipherText && fs.existsSync(VAULT_PATH)) {
      cipherText = fs.readFileSync(VAULT_PATH, 'utf8');
    }

    if (!password || !cipherText) {
      console.error('❌ 請提供密碼與加密字串');
      process.exit(1);
    }

    try {
      const decrypted = decrypt(cipherText, password);
      fs.writeFileSync(ENV_PATH, decrypted, 'utf8');
      console.log('\n🎉 解密成功！已將機密資訊同步寫入本機 .env 檔案！');
      const lines = decrypted.split(/\r?\n/).filter(l => l.includes('=') && !l.trim().startsWith('#'));
      lines.forEach(l => console.log('   • ' + l.split('=')[0]));
    } catch (err) {
      console.error('❌ 解密失敗：密碼錯誤或密文損毀！');
      process.exit(1);
    }
    break;
  }

  case 'update-example': {
    if (!fs.existsSync(ENV_PATH)) {
      console.error('❌ 找不到 .env 檔案');
      process.exit(1);
    }
    const envContent = fs.readFileSync(ENV_PATH, 'utf8');
    const lines = envContent.split(/\r?\n/);
    const sanitized = lines.map(line => {
      if (line.trim().startsWith('#') || !line.includes('=')) return line;
      const key = line.split('=')[0];
      return `${key}=`;
    });
    fs.writeFileSync(EXAMPLE_PATH, sanitized.join('\n'), 'utf8');
    console.log('✅ .env.example 公開範本檔已同步更新（所有真實數值皆已安全遮蔽）！');
    break;
  }

  case 'edit': {
    if (!fs.existsSync(ENV_PATH)) {
      if (fs.existsSync(EXAMPLE_PATH)) {
        fs.copyFileSync(EXAMPLE_PATH, ENV_PATH);
      } else {
        fs.writeFileSync(ENV_PATH, 'PORT=3000\nNODE_ENV=development\nOLLAMA_BASE_URL=http://localhost:11434\nOLLAMA_MODEL=llama3.2\n', 'utf8');
      }
    }
    console.log('📝 正在為您開啟 .env 設定檔...');
    try {
      execSync(`notepad.exe "${ENV_PATH}"`);
    } catch (e) {}
    break;
  }

  default:
    console.log('未知操作');
}
