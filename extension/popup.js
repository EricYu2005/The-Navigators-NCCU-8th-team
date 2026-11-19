/**
 * 好選保健 PurePick - Chrome 擴充套件 Popup 邏輯
 * 零 Emoji 規範
 */

document.addEventListener('DOMContentLoaded', () => {
  const WEB_URL = 'https://carenav-nin9.onrender.com';

  const btnScan = document.getElementById('btn-manual-scan');
  const btnOpenWeb = document.getElementById('btn-open-web');
  const chkIntercept = document.getElementById('chk-intercept');
  const chkDris = document.getElementById('chk-dris');

  // 讀取設定
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(['interceptEnabled', 'drisEnabled'], (res) => {
      if (res.interceptEnabled !== undefined) chkIntercept.checked = res.interceptEnabled;
      if (res.drisEnabled !== undefined) chkDris.checked = res.drisEnabled;
    });

    chkIntercept.addEventListener('change', () => {
      chrome.storage.local.set({ interceptEnabled: chkIntercept.checked });
    });
    chkDris.addEventListener('change', () => {
      chrome.storage.local.set({ drisEnabled: chkDris.checked });
    });
  }

  // 手動掃描當前分頁
  btnScan?.addEventListener('click', () => {
    btnScan.textContent = '正在掃描購物車...';
    btnScan.disabled = true;

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'RUN_SCAN' }, (response) => {
            btnScan.textContent = '掃描完成！已彈出警示';
            setTimeout(() => {
              btnScan.textContent = '立即掃描目前分頁購物車';
              btnScan.disabled = false;
            }, 1800);
          });
        }
      });
    } else {
      setTimeout(() => {
        btnScan.textContent = '掃描完成！已模擬警示';
        setTimeout(() => {
          btnScan.textContent = '立即掃描目前分頁購物車';
          btnScan.disabled = false;
        }, 1800);
      }, 600);
    }
  });

  // 開啟平台主頁
  btnOpenWeb?.addEventListener('click', () => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: WEB_URL });
    } else {
      window.open(WEB_URL, '_blank');
    }
  });
});
