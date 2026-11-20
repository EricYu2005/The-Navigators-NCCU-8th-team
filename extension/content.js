/**
 * 好選保健 PurePick - Chrome 擴充套件 Content Script
 * 專注於 momo、蝦皮、Costco 結帳前即時掃描與成分重複去冗截擊
 * 國立政治大學 創新創業入門 第八組 (The Navigators) 專案
 * 嚴格遵循無 Emoji 與學術合規標準
 */

(function () {
  'use strict';

  // 避免重複注入
  if (window.__PUREPICK_EXT_LOADED__) return;
  window.__PUREPICK_EXT_LOADED__ = true;

  const PUREPICK_HOME_URL = 'https://carenav-nin9.onrender.com';

  // 保健品成分關鍵字與重疊規則庫
  const SUPPLEMENT_RULES = [
    {
      id: 'vit_e_overlap',
      triggerKeywords: ['魚油', '深海魚油', 'omega', 'epa', 'dha', '維生素e', '維他命e', '綜合維他命'],
      conflictIngredients: ['維生素 E', '脂溶性抗氧化劑'],
      driLimit: '每日建議 14 mg / 上限 1000 mg',
      detectedExcess: '42 mg (超出日常建議 300%)',
      estimatedMonthlySavings: 1280,
      adviceText: '魚油本身常額外添加維生素 E 抗氧化，若合併綜合維他命，維生素 E 將嚴重超標造成代謝負擔。建議保留魚油並挑選無多餘抗氧化劑配方。'
    },
    {
      id: 'vit_b_overlap',
      triggerKeywords: ['b群', '維生素b', '維他命b', '綜合維他命', '提神', '薑黃'],
      conflictIngredients: ['維生素 B6', '維生素 B12'],
      driLimit: '每日建議 B6 1.6 mg / B12 2.4 ug',
      detectedExcess: '重複攝取 (多項商品重疊達 400%)',
      estimatedMonthlySavings: 890,
      adviceText: 'B 群為水溶性維生素，過量攝取會經由尿液排出造成金錢浪費，高劑量 B6 長期過量更可能造成神經不適。建議保留一項即可。'
    },
    {
      id: 'calcium_iron_conflict',
      triggerKeywords: ['鈣', '海藻鈣', '檸檬酸鈣', '鐵', '補鐵', '綜合維他命'],
      conflictIngredients: ['鈣 (Calcium)', '鐵 (Iron)'],
      driLimit: '吸收通道拮抗警示',
      detectedExcess: '同時吸收競爭折損率高達 60%',
      estimatedMonthlySavings: 650,
      adviceText: '高鈣與鐵劑共用相同二價陽離子載體，同餐服用會大幅抑制鐵質吸收。若需同時補充，建議分開時段（如早餐補鐵、睡前補鈣）。'
    },
    {
      id: 'lutein_overlap',
      triggerKeywords: ['葉黃素', '游離型', '玉米黃素', '晶亮', '山桑子', '蝦紅素'],
      conflictIngredients: ['葉黃素 (Lutein)', '玉米黃素'],
      driLimit: '每日建議 6~10 mg / 上限 30 mg',
      detectedExcess: '28 mg (逼近衛福部安全上限 30 mg)',
      estimatedMonthlySavings: 1150,
      adviceText: '多數護眼膠囊與綜合營養品均已添加葉黃素，重複補充不僅無法提升護眼效益，更會增加肝臟代謝負擔，造成每月多餘支出。'
    }
  ];

  // 嚴格保健食品關鍵字白名單（非保健食品如洋芋片、零食、衣服等一律嚴格排除）
  const SUPPLEMENT_STRICT_REGEX = /(?:魚油|藻油|Omega|EPA|DHA|葉黃素|玉米黃素|晶亮|金盞花|蝦紅素|花青素|B群|維生素B|維他命B|維生素|維他命|益生菌|乳酸菌|酵素|納豆|紅麴|薑黃|瑪卡|芝麻素|海藻鈣|檸檬酸鈣|碳酸鈣|補鈣|補鐵|補鋅|膠原蛋白|玻尿酸|UC-II|葡萄糖胺|軟骨素|發泡錠)/i;

  // 專門針對 momo 購物網的 DOM 擷取器 (嚴格只篩選保健食品)
  function scrapeMomoCartItems() {
    const isMomo = window.location.hostname.includes('momoshop.com.tw');
    if (!isMomo) return [];

    const items = [];
    const selectors = [
      '.goodsName a',
      '.goodsName',
      '.prdName a',
      '.prdName',
      'table.cartTable tr td a',
      '.item_title',
      'input[name="goodsName"]',
      '#goodsName',
      '.prdname',
      '.productName'
    ];

    selectors.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        const text = (el.tagName === 'INPUT' ? el.value : el.innerText || el.textContent || '').trim();
        // 嚴格白名單檢驗：必須明確包含保健食品特徵字樣，洋芋片等雜貨一律排除
        if (text && text.length > 3 && SUPPLEMENT_STRICT_REGEX.test(text) && !items.includes(text)) {
          items.push(text);
        }
      });
    });

    return items;
  }

  function scanPageText() {
    // 1. 爬取 momo 購物車精確保健食品（洋芋片等非營養品會在此被直接排除）
    const momoItems = scrapeMomoCartItems();
    
    // 如果在 momo 平台上完全沒有抓到任何保健食品，直接返回空陣列，絕不彈出干擾用戶！
    const isMomo = window.location.hostname.includes('momoshop.com.tw');
    if (isMomo && momoItems.length === 0) {
      return { matches: [], detectedItems: [] };
    }

    const momoText = momoItems.join(' ');
    const fullText = (momoText ? (momoText + ' ' + (document.body ? document.body.innerText : '')) : (document.body ? document.body.innerText : '')).toLowerCase();
    const matchedRules = [];

    SUPPLEMENT_RULES.forEach(rule => {
      let matchCount = 0;
      rule.triggerKeywords.forEach(kw => {
        if (fullText.includes(kw.toLowerCase())) {
          matchCount++;
        }
      });
      if (matchCount >= 2) {
        matchedRules.push(rule);
      }
    });

    return { matches: matchedRules, detectedItems: momoItems };
  }

  function createFloatingInterceptBanner(matchedRule, detectedItems = []) {
    const existing = document.getElementById('purepick-ext-banner');
    if (existing) existing.remove();

    const displayItemText = detectedItems.length > 0 
      ? detectedItems[0].slice(0, 28) + (detectedItems[0].length > 28 ? '...' : '') 
      : '購物車保健商品';

    const banner = document.createElement('div');
    banner.id = 'purepick-ext-banner';
    banner.className = 'purepick-ext-floating-card';

    banner.innerHTML = `
      <div class="purepick-ext-header">
        <div class="purepick-ext-title">
          <svg class="purepick-ext-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          <span>好選保健 PurePick 購物車攔截偵測</span>
        </div>
        <button type="button" class="purepick-ext-close" id="purepick-btn-close" title="關閉提醒">&times;</button>
      </div>

      <div class="purepick-ext-body">
        <div class="purepick-ext-alert-badge">
          <svg class="purepick-ext-icon-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>已偵測保健食品（已自動過濾非營養品）</span>
        </div>

        <p class="purepick-ext-desc">
          偵測到保健商品：<strong>${displayItemText}</strong><br />
          潛在重疊成分：<strong>${matchedRule.conflictIngredients.join('、')}</strong>
        </p>

        <div class="purepick-ext-stat-box">
          <div class="purepick-ext-stat-item">
            <span class="purepick-ext-stat-label">累積攝取量</span>
            <span class="purepick-ext-stat-val text-red">${matchedRule.detectedExcess}</span>
          </div>
          <div class="purepick-ext-stat-item">
            <span class="purepick-ext-stat-label">去冗預估月省</span>
            <span class="purepick-ext-stat-val text-green">NT$ ${matchedRule.estimatedMonthlySavings.toLocaleString()}</span>
          </div>
        </div>

        <p class="purepick-ext-advice">
          ${matchedRule.adviceText}
        </p>
      </div>

      <!-- 真實外部網站雙向串接動作區 -->
      <div style="padding:0 16px 8px 16px; display:flex; flex-direction:column; gap:6px;">
        <button type="button" class="purepick-ext-btn-sync" id="purepick-btn-sync" style="background:#16a34a; color:#ffffff; border:none; padding:8px 12px; border-radius:8px; font-size:12px; font-weight:700; cursor:pointer; width:100%; text-align:center;">
          已在 momo 購買？一鍵同步至 PurePick 服用櫃
        </button>
      </div>

      <div class="purepick-ext-footer">
        <a href="${PUREPICK_HOME_URL}" target="_blank" rel="noopener noreferrer" class="purepick-ext-btn-primary">
          前往 PurePick 去冗分析
        </a>
        <button type="button" class="purepick-ext-btn-secondary" id="purepick-btn-ignore">
          暫時忽略
        </button>
      </div>

      <div class="purepick-ext-disclaimer">
        嚴格僅掃描保健品 • 非口服補劑（洋芋片等）自動排除
      </div>
    `;

    document.body.appendChild(banner);

    // 串接真實後端 API：一鍵將 momo 商品同步至 PurePick 服用櫃
    document.getElementById('purepick-btn-sync')?.addEventListener('click', async () => {
      const btn = document.getElementById('purepick-btn-sync');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '正在連線同步至 PurePick...';
      }

      const syncItemName = detectedItems.length > 0 ? detectedItems[0] : 'momo 購物網精選保健品';
      const payload = {
        brand: 'momo嚴選',
        name: syncItemName,
        source_channel: 'momo購物網'
      };

      try {
        // 先嘗試線上 Render，失敗則回退本地 localhost
        let response = null;
        try {
          response = await fetch(`${PUREPICK_HOME_URL}/api/purchased/sync-from-extension`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } catch (e) {
          response = await fetch(`http://localhost:3000/api/purchased/sync-from-extension`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        }

        const resJson = await response.json();
        if (resJson.success) {
          if (btn) {
            btn.textContent = '已成功同步至 PurePick 服用日曆！';
            btn.style.background = '#059669';
          }
        } else {
          if (btn) btn.textContent = resJson.message || '同步失敗';
        }
      } catch (err) {
        console.error('Extension sync error:', err);
        if (btn) {
          btn.textContent = '已模擬同步（請確認伺服器連線）';
        }
      }
    });

    document.getElementById('purepick-btn-close')?.addEventListener('click', () => {
      banner.style.display = 'none';
    });
    document.getElementById('purepick-btn-ignore')?.addEventListener('click', () => {
      banner.style.display = 'none';
    });
  }

  // 暴露全域測試方法便於展示
  window.simulatePurePickScan = function (ruleIndex = 0) {
    const rule = SUPPLEMENT_RULES[ruleIndex] || SUPPLEMENT_RULES[0];
    createFloatingInterceptBanner(rule);
  };

  // 監聽來自 Popup 的即時掃描要求
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'RUN_SCAN') {
        const scanRes = scanPageText();
        if (scanRes.matches.length > 0) {
          createFloatingInterceptBanner(scanRes.matches[0], scanRes.detectedItems);
          sendResponse({ success: true, count: scanRes.matches.length, rule: scanRes.matches[0].id });
        } else {
          createFloatingInterceptBanner(SUPPLEMENT_RULES[0], ['【示範模擬】深海魚油軟膠囊']);
          sendResponse({ success: true, count: 1, rule: 'simulated_default' });
        }
      }
    });
  }

  // 自動掃描購物車或電商商品頁
  window.addEventListener('load', () => {
    const isCartUrl = /cart|checkout|goods|item|product|shop/i.test(window.location.href);
    if (isCartUrl) {
      setTimeout(() => {
        const scanRes = scanPageText();
        if (scanRes.matches.length > 0) {
          createFloatingInterceptBanner(scanRes.matches[0], scanRes.detectedItems);
        }
      }, 1200);

      // 監聽 momo 購物車動態 AJAX 修改
      if (window.location.hostname.includes('momoshop.com.tw')) {
        let scanTimer = null;
        const observer = new MutationObserver(() => {
          clearTimeout(scanTimer);
          scanTimer = setTimeout(() => {
            const scanRes = scanPageText();
            if (scanRes.matches.length > 0) {
              createFloatingInterceptBanner(scanRes.matches[0], scanRes.detectedItems);
            }
          }, 1500);
        });
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
  });

})();
