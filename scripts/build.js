/**
 * scripts/build.js
 * 好選保健 PurePick 雲端建置自動化腳本
 * 針對 Linux (Render) 環境自動從原始碼編譯 sqlite3，
 * 徹底解決 prebuilt binary 與主機 GLIBC 版本不符 (GLIBC_2.38 not found) 之問題。
 */

const { execSync } = require('child_process');

console.log(`[PurePick Build] 偵測到運行平台: ${process.platform} (${process.arch})`);

if (process.platform === 'linux') {
  console.log('[PurePick Build] 偵測為 Linux (Render) 雲端環境！');
  console.log('[PurePick Build] 正在透過 host GCC 從原始碼編譯 sqlite3 以適配主機 GLIBC...');
  try {
    execSync('npm rebuild sqlite3 --build-from-source', { stdio: 'inherit' });
    console.log('[PurePick Build] ✅ sqlite3 本地原始碼編譯成功！相容目前 Linux 環境。');
  } catch (err) {
    console.error('[PurePick Build] ❌ sqlite3 編譯失敗:', err.message);
    process.exit(1);
  }
} else {
  console.log('[PurePick Build] 非 Linux 環境 (本機開發)，跳過 C++ 原始碼重新編譯。');
}
