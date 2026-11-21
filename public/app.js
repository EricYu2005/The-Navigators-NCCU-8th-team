/**
 * app.js
 * 好選保健 PurePick - 跨品牌保健食品比較、去冗評估與服用日曆管理前端互動邏輯
 */

function loadSavedNhiMeds() {
  try {
    const raw = localStorage.getItem('purepick_nhi_meds');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

const state = {
  supplements: [],
  wishlist: [],
  purchased: [],
  calendarLogs: {},
  wishlistAnalysis: null,
  finderResult: null,
  activeView: 'view-finder',
  catalogCategory: 'all',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth() + 1, // 1-12
  selectedDateStr: formatDateStr(new Date()),
  currentUser: null,
  isDemoCleared: false,
  isPro: localStorage.getItem('purepick_pro') === 'true',
  nhiMedications: loadSavedNhiMeds(),
  nhiImportSource: localStorage.getItem('purepick_nhi_source') || '尚未匯入資料'
};

let deferredPwaPrompt = null;

function formatDateStr(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function showToast(message) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'toast-msg';
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => {
    el.remove();
  }, 3200);
}

// ========================================================
// 1. 初始化與資料載入
// ========================================================
document.addEventListener('DOMContentLoaded', async () => {
  await initUserAuth();
  await loadBootstrapData();
});

async function loadBootstrapData() {
  try {
    const res = await fetch('/api/bootstrap');
    const json = await res.json();
    if (json.success && json.data) {
      state.supplements = json.data.supplements || [];
      state.wishlist = json.data.wishlist || [];
      state.purchased = json.data.purchased || [];
      state.calendarLogs = json.data.calendarLogs || {};
      state.wishlistAnalysis = json.data.wishlistAnalysis || null;
      state.isDemoCleared = state.wishlist.length === 0 && state.purchased.length === 0;

      updateNavBadges();
      renderCatalog();
      renderWishlistView();
      renderCalendarView();
    }
  } catch (err) {
    console.error('載入平台資料失敗:', err);
  }
}

function updateNavBadges() {
  const wCount = state.wishlist.length;
  const pCount = state.purchased.length;

  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setTxt('nav-wishlist-count', wCount);
  setTxt('nav-purchased-count', pCount);
  setTxt('m-wishlist-count', wCount);
  setTxt('m-purchased-count', pCount);
  setTxt('wishlist-panel-count', `${wCount} 款`);
  setTxt('purchased-cabinet-count', `${pCount} 款`);

  const demoBtn = document.getElementById('btn-toggle-demo');
  if (demoBtn) {
    demoBtn.title = state.isDemoCleared ? '恢復預設範例' : '清空範例';
    demoBtn.setAttribute('aria-label', demoBtn.title);
    demoBtn.classList.toggle('active', state.isDemoCleared);
    if (state.currentUser) {
      demoBtn.style.display = 'none';
    }
  }
}

function switchView(viewId) {
  state.activeView = viewId;
  document.querySelectorAll('.view-section').forEach(sec => {
    sec.classList.toggle('active', sec.id === viewId);
  });
  document.querySelectorAll('.b-tab-item[data-target]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.target === viewId);
  });

  const viewTitles = {
    'view-finder': '尋找適合您的保健方案',
    'view-wishlist': '有興趣清單 ＆ 重疊去冗分析',
    'view-calendar': '已購買保健櫃 ＆ 服用狀態日曆'
  };
  const labelEl = document.getElementById('top-current-view-label');
  if (labelEl && viewTitles[viewId]) {
    labelEl.textContent = viewTitles[viewId];
  }

  if (viewId === 'view-wishlist') {
    renderWishlistView();
  } else if (viewId === 'view-calendar') {
    renderCalendarView();
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.switchView = switchView;

// ========================================================
// 2. 【功能一：尋找】互動式需求表單與跨品牌比較
// ========================================================
function fillFinderSample(sampleId) {
  const samples = {
    1: {
      text: '我是軟體工程師，每天看電腦螢幕超過 10 小時，下午眼睛非常乾澀酸疲；平常三餐都吃外食便當，幾乎沒吃魚，想找真正高濃度划算的護眼跟魚油組合。',
      goals: ['eye', 'cardio'],
      budget: '1200_2000',
      diet: 'all',
      form: 'all'
    },
    2: {
      text: '最近趕專案常熬夜到凌晨，白天上班精神很差、容易嘴破；可是晚上躺到床上又很淺眠多夢、半夜容易醒來，希望白天有精神、晚上能放鬆好睡。',
      goals: ['energy', 'bone'],
      budget: '1200_2000',
      diet: 'all',
      form: 'all'
    },
    3: {
      text: '平常青菜吃得少，常常兩三天才排便一次而且肚子容易脹氣；之前買過市售乳酸菌覺得太甜像在吃糖粉，想找無添加糖跟香料的足量益生菌。',
      goals: ['gut'],
      budget: '500_1200',
      diet: 'vegan',
      form: 'powder'
    },
    4: {
      text: '想幫家裡長輩挑保健品，長輩最近走路上下樓梯覺得關節卡卡、晚上睡不好容易抽筋，而且很怕吞大顆的膠囊，預算大概兩千到三千元以內。',
      goals: ['bone', 'cardio'],
      budget: '2000_3000',
      diet: 'all',
      form: 'small'
    }
  };

  const s = samples[sampleId];
  if (!s) return;

  const textEl = document.getElementById('finder-free-text');
  if (textEl) textEl.value = s.text;

  document.querySelectorAll('#goal-checkbox-grid input[name="goal"]').forEach(cb => {
    cb.checked = s.goals.includes(cb.value);
  });

  document.querySelectorAll('#budget-radio-grid input[name="budgetTier"]').forEach(rb => {
    rb.checked = rb.value === s.budget;
  });

  const dietEl = document.getElementById('finder-diet');
  if (dietEl) dietEl.value = s.diet;

  const formEl = document.getElementById('finder-form-pref');
  if (formEl) formEl.value = s.form;

  handleFinderSubmit();
}
window.fillFinderSample = fillFinderSample;

async function handleFinderSubmit(e) {
  if (e) e.preventDefault();

  const freeText = document.getElementById('finder-free-text')?.value || '';
  const goals = Array.from(document.querySelectorAll('#goal-checkbox-grid input[name="goal"]:checked')).map(el => el.value);
  const budgetTier = document.querySelector('#budget-radio-grid input[name="budgetTier"]:checked')?.value || '1200_2000';
  const diet = document.getElementById('finder-diet')?.value || 'all';
  const formPref = document.getElementById('finder-form-pref')?.value || 'all';

  const btn = document.getElementById('btn-run-finder');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '分析比對中...';
  }

  try {
    const res = await fetch('/api/finder/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ freeText, goals, diet, formPref, budgetTier })
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.finderResult = json.data;
      renderFinderResult(json.data);
    }
  } catch (err) {
    showToast('分析發生錯誤，請稍後再試');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '開始分析方案';
    }
  }
}
window.handleFinderSubmit = handleFinderSubmit;

function renderFinderResult(result) {
  const area = document.getElementById('finder-result-area');
  if (!area) return;

  const bundleIds = (result.recommendedBundle || []).map(x => x.id);
  const reasonsHtml = (result.matchedReasons || []).map(r => `
    <div style="margin-top:0.55rem; padding:0.65rem 0.85rem; background:#fffbeb; border-radius:8px; border:1.5px solid #c4b5fd; font-size:0.85rem;">
      <strong style="color:#7c3aed;">【${r.category}｜${r.label}】挑選標準：</strong>
      <span>${r.buyingAdvice}</span>
    </div>
  `).join('');

  const comparisonsHtml = (result.categoryComparisons || []).map(group => {
    const cardsHtml = (group.products || []).slice(0, 3).map(item => renderSupplementCardHtml(item, item.id === group.topPickId)).join('');
    return `
      <div style="margin-top: 1.35rem;">
        <h3 style="font-size: 1.05rem; font-weight: 800; color: #2e1065; margin-bottom: 0.75rem;">
          【${group.category}】效益與花費比較
        </h3>
        <div class="catalog-grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  }).join('');

  area.style.display = 'block';
  area.innerHTML = `
    <div class="card finder-result-card">
      <div class="result-summary-box">
        <h3>個人化保健購買建議</h3>
        <p style="font-size:0.93rem; color:#1e293b;">${result.personalizedSummary}</p>
        ${reasonsHtml}
        <div class="dont-waste-box">
          <strong>省錢提醒：</strong>${result.dontWasteMoneyOn}
        </div>
      </div>

      <div class="bundle-recommendation-bar">
        <div>
          <div style="font-size:0.8rem; color:#94a3b8;">預算內最優組合（共 ${(result.recommendedBundle || []).length} 款）</div>
          <div style="font-size:1rem; font-weight:700; margin-top:0.15rem;">
            ${(result.recommendedBundle || []).map(x => `${x.brand} ${x.name}`).join(' ＋ ')}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
          <div>
            <span style="font-size:0.78rem; color:#cbd5e1;">組合每月總花費：</span>
            <span class="bundle-price-tag">NT$ ${result.bundleMonthlyCost} / 月</span>
            <span style="font-size:0.78rem; color:#94a3b8;">（每日約 $${result.bundleDailyCost}）</span>
          </div>
          <button type="button" class="btn btn-primary" onclick="addBundleToWishlist([${bundleIds.join(',')}])">
            加入清單分析
          </button>
        </div>
      </div>

      <!-- 潛在消費者名單登記 CTA (創創團隊驗證專用) -->
      <div class="lead-cta-card">
        <div class="lead-cta-content">
          <div class="lead-cta-icon-wrap">
            <svg class="icon-svg-lg" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          </div>
          <div>
            <h4>索取個人專屬保健避坑與省錢評估報告</h4>
            <p>我們的演算法已為您初篩合適成分。若想由團隊提供更深度的成分重複檢視或客製化優惠情報，歡迎免費登記！</p>
          </div>
        </div>
        <button type="button" class="btn btn-primary" onclick="openLeadModal('finder_result')">
          免費登記索取報告
        </button>
      </div>

      ${comparisonsHtml}
    </div>
  `;

  area.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function addBundleToWishlist(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return;
  for (const id of ids) {
    await addToUserList(id, 'wishlist', true);
  }
  showToast('已將推薦組合加入「有興趣清單」！正在為您開啟重疊去冗分析...');
  switchView('view-wishlist');
}
window.addBundleToWishlist = addBundleToWishlist;

// ========================================================
// 3. 跨品牌保健品透明比價庫渲染
// ========================================================
function setCatalogCategory(cat) {
  state.catalogCategory = cat;
  document.querySelectorAll('#category-filter-pills .cat-pill').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });
  renderCatalog();
}
window.setCatalogCategory = setCatalogCategory;

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  const query = (document.getElementById('catalog-search-input')?.value || '').trim().toLowerCase();
  const sortBy = document.getElementById('catalog-sort-select')?.value || 'score_desc';

  let list = state.supplements.filter(item => {
    if (state.catalogCategory !== 'all' && item.category !== state.catalogCategory) {
      return false;
    }
    if (query) {
      const hay = `${item.brand} ${item.name} ${item.category} ${item.active_summary} ${item.absorption_form}`.toLowerCase();
      return hay.includes(query);
    }
    return true;
  });

  list.sort((a, b) => {
    if (sortBy === 'monthly_asc') return Number(a.monthly_cost) - Number(b.monthly_cost);
    if (sortBy === 'price_asc') return Number(a.price) - Number(b.price);
    return Number(a.daily_cost) - Number(b.daily_cost);
  });

  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:2rem; color:#64748b;">找不到符合條件的保健食品，可嘗試切換分類或點選右上角手動新增。</div>`;
    return;
  }

  grid.innerHTML = list.map(item => renderSupplementCardHtml(item, false)).join('');
}
window.renderCatalog = renderCatalog;

function renderSupplementCardHtml(item, isTopPick) {
  const inWishlist = state.wishlist.some(x => Number(x.id) === Number(item.id));
  const inPurchased = state.purchased.some(x => Number(x.id) === Number(item.id));

  return `
    <div class="supp-card ${isTopPick ? 'top-recommended' : ''}">
      <div>
        <div class="supp-top-row">
          <div>
            <span class="supp-cat-badge">${item.category}</span>
            ${isTopPick ? '<span class="supp-cat-badge" style="background:#7c3aed;color:#fff;margin-left:4px;">預算推薦</span>' : ''}
            ${item.is_vegan ? '<span class="supp-cat-badge" style="background:#dcfce7;color:#15803d;margin-left:4px;">素食</span>' : ''}
          </div>
        </div>

        <div class="supp-brand-title">${item.brand}｜${item.name}</div>

        <div class="supp-price-metrics">
          <div class="metric-item">
            <span class="metric-label">每日真實花費</span>
            <span class="metric-val highlight-daily">NT$ ${Math.round(item.daily_cost)} / 日</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">每月換算花費</span>
            <span class="metric-val">NT$ ${item.monthly_cost}</span>
          </div>
          <div class="metric-item">
            <span class="metric-label">單盒售價 (${item.days_supply}天份)</span>
            <span class="metric-val">$${item.price}</span>
          </div>
        </div>

        <div class="supp-spec-list">
          <div class="spec-row">
            <span class="spec-tag">有效成分：</span>
            <span>${item.active_summary}</span>
          </div>
          <div class="spec-row">
            <span class="spec-tag">吸收型態：</span>
            <span>${item.absorption_form}（${item.dosage_form}，每日 ${item.daily_units} 份）</span>
          </div>
          <div class="spec-row">
            <span class="spec-tag">純淨檢視：</span>
            <span>${item.additives_note || '一般標準配方'}</span>
          </div>
        </div>

        <div class="pros-cons-box">
          <div class="pro-line"><strong>優勢：</strong>${item.pros}</div>
          <div class="con-line"><strong>注意：</strong>${item.cons}</div>
        </div>
      </div>

      <div class="supp-actions-row">
        <button
          type="button"
          class="btn btn-sm ${inWishlist ? 'btn-primary' : 'btn-outline'}"
          onclick="toggleUserListItem(${item.id}, 'wishlist')"
        >
          ${inWishlist ? '已關注' : '加入分析'}
        </button>
        <button
          type="button"
          class="btn btn-sm ${inPurchased ? 'btn-teal' : 'btn-outline'}"
          onclick="toggleUserListItem(${item.id}, 'purchased')"
          title="加入已購買服用日曆櫃"
        >
          ${inPurchased ? '已在日曆櫃' : '已在外部購買（加入日曆）'}
        </button>
      </div>
    </div>
  `;
}

// ========================================================
// 4. 【功能二：管理 A - 有興趣清單與嚴格去冗分析】
// ========================================================
async function toggleUserListItem(supplementId, status) {
  const list = status === 'wishlist' ? state.wishlist : state.purchased;
  const exists = list.some(x => Number(x.id) === Number(supplementId));

  if (exists) {
    await removeFromUserList(supplementId, status);
  } else {
    await addToUserList(supplementId, status, false);
  }
}
window.toggleUserListItem = toggleUserListItem;

async function addToUserList(supplementId, status, silent = false) {
  try {
    const userName = state.currentUser?.displayName || '消費者';
    const lineUserId = state.currentUser?.userId || null;
    const res = await fetch('/api/user-supplements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ supplementId, status, userName, lineUserId })
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.wishlist = json.data.wishlist || [];
      state.purchased = json.data.purchased || [];
      state.wishlistAnalysis = json.data.wishlistAnalysis || null;
      state.isDemoCleared = false;
      updateNavBadges();
      renderCatalog();
      if (state.finderResult) renderFinderResult(state.finderResult);
      renderWishlistView();
      renderCalendarView();

      if (!silent) {
        const label = status === 'wishlist' ? '「有興趣清單」（已自動更新重疊去冗分析）' : '「已購買與服用日曆」';
        showToast(`已將商品加入${label}`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}
window.addToUserList = addToUserList;

async function removeFromUserList(supplementId, status) {
  try {
    const res = await fetch(`/api/user-supplements/${supplementId}?status=${status}`, {
      method: 'DELETE'
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.wishlist = json.data.wishlist || [];
      state.purchased = json.data.purchased || [];
      state.wishlistAnalysis = json.data.wishlistAnalysis || null;
      updateNavBadges();
      renderCatalog();
      if (state.finderResult) renderFinderResult(state.finderResult);
      renderWishlistView();
      renderCalendarView();
      showToast('已從清單移除並重新計算費用與效益');
    }
  } catch (err) {
    console.error(err);
  }
}
window.removeFromUserList = removeFromUserList;

async function moveWishlistToPurchased(supplementId) {
  try {
    const userName = state.currentUser?.displayName || '消費者';
    const res = await fetch('/api/user-supplements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplementId,
        status: 'purchased',
        moveFromWishlist: true,
        userName
      })
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.wishlist = json.data.wishlist || [];
      state.purchased = json.data.purchased || [];
      state.wishlistAnalysis = json.data.wishlistAnalysis || null;
      updateNavBadges();
      renderCatalog();
      renderWishlistView();
      renderCalendarView();
      showToast('已轉入「已購買與服用日曆」！現在可在日曆上打卡服用狀態。');
    }
  } catch (err) {
    console.error(err);
  }
}
window.moveWishlistToPurchased = moveWishlistToPurchased;

async function refreshWishlistAnalysis() {
  try {
    const res = await fetch('/api/wishlist/analyze');
    const json = await res.json();
    if (json.success && json.data) {
      state.wishlistAnalysis = json.data;
      renderWishlistView();
      showToast('已完成跨商品成分重疊與去冗省錢精算');
    }
  } catch (err) {
    console.error(err);
  }
}
window.refreshWishlistAnalysis = refreshWishlistAnalysis;

function renderWishlistView() {
  const kpiGrid = document.getElementById('wishlist-kpi-grid');
  const itemsContainer = document.getElementById('wishlist-items-container');
  const analysisContainer = document.getElementById('wishlist-analysis-container');
  if (!kpiGrid || !itemsContainer || !analysisContainer) return;

  const analysis = state.wishlistAnalysis || {
    wishlistMonthlyCost: 0,
    purchasedMonthlyCost: 0,
    potentialMonthlySavings: 0,
    optimizedMonthlyCost: 0,
    redundancyAlerts: [],
    dosageChecks: [],
    timingWarnings: [],
    overallVerdict: '尚未加入有興趣商品'
  };

  // 1. 頂部 KPI
  kpiGrid.innerHTML = `
    <div class="kpi-stat-card">
      <div class="kpi-label">有興趣清單全買每月花費</div>
      <div class="kpi-number">NT$ ${analysis.wishlistMonthlyCost} <span style="font-size:0.85rem;font-weight:600;">/ 月</span></div>
      <div class="kpi-sub">共 ${state.wishlist.length} 款考慮購買商品</div>
    </div>
    <div class="kpi-stat-card savings-highlight">
      <div class="kpi-label" style="color:#be123c;">抓出重複／不需購買可省下</div>
      <div class="kpi-number" style="color:#e11d48;">立省 NT$ ${analysis.potentialMonthlySavings} <span style="font-size:0.85rem;font-weight:600;">/ 月</span></div>
      <div class="kpi-sub">發現 ${(analysis.redundancyAlerts || []).length} 項功能或成分重疊</div>
    </div>
    <div class="kpi-stat-card optimized-highlight">
      <div class="kpi-label" style="color:#047857;">剔除重複後最佳每月花費</div>
      <div class="kpi-number" style="color:#059669;">NT$ ${analysis.optimizedMonthlyCost} <span style="font-size:0.85rem;font-weight:600;">/ 月</span></div>
      <div class="kpi-sub">另加已購買服用中 NT$ ${analysis.purchasedMonthlyCost} / 月</div>
    </div>
  `;

  // 2. 左欄：有興趣清單卡片
  const redundantIds = new Set((analysis.redundancyAlerts || []).map(a => Number(a.dropProductId)));
  if (state.wishlist.length === 0) {
    itemsContainer.innerHTML = `
      <div style="text-align:center; padding:2rem 1rem; color:#64748b;">
        <p style="margin-bottom:0.85rem;">目前「有興趣清單」沒有商品。</p>
        <button type="button" class="btn btn-primary btn-sm" onclick="switchView('view-finder')">去尋找並加入有興趣的保健品</button>
      </div>
    `;
  } else {
    itemsContainer.innerHTML = state.wishlist.map(item => {
      const isFlagged = redundantIds.has(Number(item.id));
      return `
        <div class="managed-item-card ${isFlagged ? 'redundant-warning' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:0.5rem;">
            <div>
              <span class="supp-cat-badge">${item.category}</span>
              ${isFlagged ? '<span class="supp-cat-badge" style="background:#ffe4e6;color:#be123c;margin-left:4px;">建議免買（重複）</span>' : '<span class="supp-cat-badge" style="background:#dcfce7;color:#15803d;margin-left:4px;">推薦保留</span>'}
              <span class="supp-score-badge ${Number(item.value_score || 80) >= 85 ? 'score-high' : 'score-mid'}" style="margin-left:4px;">綜合效益 ${item.value_score || 80} 分</span>
              <h4 style="font-size:0.98rem; font-weight:800; color:#0f172a; margin-top:0.35rem;">${item.brand}｜${item.name}</h4>
            </div>
            <div style="text-align:right; white-space:nowrap;">
              <div style="font-size:0.95rem; font-weight:800; color:#0284c7;">NT$ ${item.monthly_cost} / 月</div>
              <div style="font-size:0.74rem; color:#64748b;">每日 $${Math.round(item.daily_cost)}</div>
            </div>
          </div>
          <div style="font-size:0.8rem; color:#475569; margin:0.5rem 0;">
            <strong>核心成分：</strong>${item.active_summary}
          </div>
          <div style="display:flex; gap:0.5rem; justify-content:flex-end; margin-top:0.65rem;">
            <button type="button" class="btn btn-sm btn-outline" onclick="moveWishlistToPurchased(${item.id})">
              已在外部購買（轉入日曆）
            </button>
            <button type="button" class="btn btn-sm btn-danger-soft" onclick="removeFromUserList(${item.id}, 'wishlist')">
              剔除
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. 右欄：去冗省錢建議、合併劑量檢核、服用時段提醒
  const rawAlerts = analysis.redundancyAlerts || [];
  let visibleAlerts = rawAlerts;
  if (!state.isPro && rawAlerts.length > 1) {
    visibleAlerts = rawAlerts.slice(0, 1);
  }

  const alertsHtml = visibleAlerts.length === 0
    ? `<div style="padding:0.9rem 1rem; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:0.88rem; margin-bottom:1rem;">
         目前有興趣與服用中的商品無重複或衝突，配置精準！
       </div>`
    : visibleAlerts.map(alert => `
        <div class="redundancy-alert-card">
          <div class="redundancy-header">
            <span class="redundancy-title">建議無需購買【${alert.dropProductName}】</span>
            <span class="save-badge">刪除可省 NT$ ${alert.savedMonthly} / 月</span>
          </div>
          <p style="font-size:0.85rem; color:#881337; margin-bottom:0.65rem;">
            ${alert.reason}
          </p>
          <button type="button" class="btn btn-sm btn-danger-soft" onclick="removeFromUserList(${alert.dropProductId}, 'wishlist')">
            從清單剔除（月省 $${alert.savedMonthly}）
          </button>
        </div>
      `).join('');

  const dosageHtml = (analysis.dosageChecks || []).map(d => {
    const widthPct = Math.min(100, Math.max(12, Math.round((d.totalAmount / (d.recommended * 1.5)) * 100)));
    let barClass = 'fill-optimal';
    let badgeBg = '#dcfce7';
    let badgeColor = '#15803d';

    if (d.status === 'exceed_ul') {
      barClass = 'fill-exceed';
      badgeBg = '#ffe4e6';
      badgeColor = '#be123c';
    } else if (d.status === 'duplicate_high') {
      barClass = 'fill-high';
      badgeBg = '#fef3c7';
      badgeColor = '#b45309';
    } else if (d.status === 'low') {
      barClass = 'fill-low';
      badgeBg = '#f1f5f9';
      badgeColor = '#475569';
    }

    return `
      <div class="dosage-row">
        <div class="dosage-row-top">
          <span>${d.name}：合計 <strong>${d.totalAmount} ${d.unit}</strong>（建議量 ${d.recommended}${d.unit} / 安全上限 ${d.ul}${d.unit}）</span>
          <span style="font-size:0.74rem; padding:2px 8px; border-radius:999px; background:${badgeBg}; color:${badgeColor};">${d.statusLabel}</span>
        </div>
        <div class="dosage-bar-track">
          <div class="dosage-bar-fill ${barClass}" style="width:${widthPct}%;"></div>
        </div>
        <div style="font-size:0.75rem; color:#64748b;">
          來源商品：${(d.sources || []).join(' ＋ ')}
        </div>
      </div>
    `;
  }).join('');

  const timingHtml = (analysis.timingWarnings || []).map(w => `
    <div style="display:flex; align-items:center; gap:0.4rem; padding:0.65rem 0.85rem; background:#fffbeb; border:1px solid #fde68a; border-radius:8px; font-size:0.83rem; color:#92400e; margin-bottom:0.5rem;">
      <svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>${w}</span>
    </div>
  `).join('');

  // Pro 門檻引導或開通徽章
  const proGateBannerHtml = !state.isPro ? `
    <div class="pro-gate-card">
      <div class="pro-gate-header">
        <span class="pro-badge">PRO 專屬功能</span>
        <h4>解鎖「無上限成分重疊精算」與「成分超標 (UL) 安全警示」</h4>
      </div>
      <p>免費版僅支援最多 2 款基礎成分比對。想要一次比對多款保健品、精算每年省下數千元冤枉錢嗎？</p>
      <div class="mvp-gate-note">
        <svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
        <span><strong>創創專題 MVP 說明</strong>：本專案為概念驗證階段，<strong>不收取任何真實費用</strong>。留下聯絡資訊登記名單，即可立刻免費開通 Pro 完整去冗分析！</span>
      </div>
      <button type="button" class="btn btn-primary" onclick="openLeadModal('wishlist_pro_gate')">
        立即免費登記留名單（開通 Pro 去冗精算）
      </button>
    </div>
  ` : `
    <div class="pro-unlocked-banner">
      <span class="pro-unlocked-badge">PRO 方案已開通</span>
      <span>您已享有完整的跨品項去冗精算、有效成分安全上限 (UL) 監控與服用時段衝突檢驗！</span>
    </div>
  `;

  // 劑量檢核與時段提醒區塊 (若非 Pro 則加上局部鎖定覆蓋)
  const dosageAndTimingSection = state.isPro ? `
    <div class="dosage-table-wrap">
      <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
        2. 合併每日有效成分總量檢核（對照每日建議攝取量與安全上限）
      </h4>
      ${dosageHtml || '<p style="font-size:0.84rem;color:#64748b;">尚無成分資料</p>'}
    </div>
    ${timingHtml ? `
      <div style="margin-top:1.25rem;">
        <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
          3. 服用時段與吸收衝突提醒
        </h4>
        ${timingHtml}
      </div>
    ` : ''}
  ` : `
    <div class="pro-lock-overlay-wrap">
      <div class="pro-blur-content">
        <div class="dosage-table-wrap">
          <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
            2. 合併每日有效成分總量檢核（對照每日建議攝取量與安全上限）
          </h4>
          ${dosageHtml || '<p style="font-size:0.84rem;color:#64748b;">尚無成分資料</p>'}
        </div>
        ${timingHtml ? `
          <div style="margin-top:1.25rem;">
            <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
              3. 服用時段與吸收衝突提醒
            </h4>
            ${timingHtml}
          </div>
        ` : ''}
      </div>
      <div class="pro-lock-overlay-btn-box">
        <div style="font-size:0.95rem; font-weight:800; color:#4c1d95; margin-bottom:0.25rem;">
          解鎖完整成分安全上限 (UL) 監控與時序衝突檢驗
        </div>
        <p style="font-size:0.8rem; color:#6b7280; max-width:360px; margin-bottom:0.5rem;">
          避免鈣鐵同時吃吸收折損、或高劑量成分超標。MVP 期間登記留名單即可免費開通！
        </p>
        <button type="button" class="btn btn-primary btn-sm" onclick="openLeadModal('dosage_lock')">
          登記留名單免費開通 Pro 權限
        </button>
      </div>
    </div>
  `;

  const nhiInteractions = evaluateNhiInteractions();
  const criticalNhi = nhiInteractions.filter(x => x.risk === 'high' || x.risk === 'moderate');
  const nhiSummaryBannerHtml = criticalNhi.length > 0 ? `
    <div style="margin-bottom:1rem; padding:0.9rem 1rem; background:#fef2f2; border:1.5px solid #fca5a5; border-radius:10px; display:flex; justify-content:space-between; align-items:center; gap:0.75rem; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">
        <div style="font-size:0.86rem; font-weight:800; color:#b91c1c; margin-bottom:0.2rem;">
          【健保快易通交互作用警示】偵測到 ${criticalNhi.length} 項西藥處方與保健品衝突！
        </div>
        <div style="font-size:0.8rem; color:#7f1d1d;">
          ${escapeHtml(criticalNhi[0].title)}
        </div>
      </div>
      <button type="button" class="btn btn-sm btn-primary" style="background:#dc2626; border-color:#dc2626;" onclick="jumpToNhiHealthBank()">
        查看完整避坑詳情
      </button>
    </div>
  ` : '';

  analysisContainer.innerHTML = `
    ${nhiSummaryBannerHtml}
    ${proGateBannerHtml}

    <div class="verdict-banner">
      <strong>整體評估：</strong><br/>
      ${analysis.overallVerdict}
    </div>

    <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
      1. 跨商品重疊去冗建議（有興趣清單 vs. 已購買服用中）
    </h4>
    ${alertsHtml}

    ${dosageAndTimingSection}

    <!-- 藥師審查預約名單卡片 -->
    <div style="margin-top:1.5rem; padding:1.1rem 1.25rem; background:#fffbeb; border:1.5px solid #e5e7eb; border-radius:14px; display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
      <div style="min-width:240px; flex:1;">
        <h5 style="font-size:0.96rem; font-weight:800; color:#111827; margin-bottom:0.25rem;">想要無偏見藥師幫您一對一檢查目前吃的所有保健品嗎？</h5>
        <p style="font-size:0.83rem; color:#4b5563; margin:0;">歡迎登記預約，我們提供不推銷特定品牌的學術研究避坑諮詢。</p>
      </div>
      <button type="button" class="btn btn-primary" onclick="openLeadModal('wishlist_analysis')">
        預約免費名單登記
      </button>
    </div>
  `;

  renderNhiHealthBankPanel();
}

// ========================================================
// 5. 【功能三：管理 B - 已購買清單與月經日曆式服用追蹤】
// ========================================================
function renderCalendarView() {
  renderCalendarKpis();
  renderWeeklySummary();
  renderCalendarGrid();
  renderDailyTrackerPanel();
  renderPurchasedCabinet();
}

function renderWeeklySummary() {
  const container = document.getElementById('weekly-summary-body');
  const dateRangeEl = document.getElementById('weekly-date-range');
  if (!container) return;

  if (!state.isPro) {
    if (dateRangeEl) {
      dateRangeEl.textContent = 'Pro 專屬體感大數據診斷';
    }
    container.innerHTML = `
      <div style="padding:1.25rem; text-align:center; background:#faf5ff; border:1.5px dashed #c084fc; border-radius:10px;">
        <div style="display:inline-flex; align-items:center; gap:0.4rem; color:#6b21a8; font-weight:800; font-size:0.95rem; margin-bottom:0.35rem;">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>每週身體健康總結與 1-to-1 配方升級建議（Pro 專屬）</span>
        </div>
        <p style="font-size:0.83rem; color:#475569; max-width:540px; margin:0 auto 0.75rem auto; line-height:1.45;">
          系統會根據您過去 7 天的身體狀態日誌（如眼乾、疲勞、排便脹氣頻率），自動進行體感痛點複盤，並推薦同品類性價比更高的進化商品！
        </p>
        <button type="button" class="btn btn-primary btn-sm" onclick="openLeadModal('weekly_summary_lock')">
          填寫簡短回饋，免費開通 Pro 權限 (NT$ 99 / 月)
        </button>
      </div>
    `;
    return;
  }

  // 計算過去 7 天的日期陣列
  const today = new Date();
  const past7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(today.getDate() - i);
    past7Days.push(formatDateStr(d));
  }

  if (dateRangeEl) {
    dateRangeEl.textContent = `${past7Days[0]} 至 ${past7Days[6]}（過去 7 日體感趨勢）`;
  }

  let eyeDryCount = 0;
  let fatigueCount = 0;
  let digestionBadCount = 0;
  let sickCount = 0;
  let goodCount = 0;
  let takenTotal = 0;

  past7Days.forEach(dateStr => {
    const log = state.calendarLogs[dateStr] || {};
    if (log.sleepEyeStatus === '眼睛乾酸') eyeDryCount++;
    if (log.energyLevel === '疲倦想睡') fatigueCount++;
    if (log.digestionStatus === '排便不順' || log.digestionStatus === '稍微脹氣') digestionBadCount++;
    if (log.isSickMode) sickCount++;
    if (log.energyLevel === '精神飽滿' || log.sleepEyeStatus === '睡眠深沉' || log.sleepEyeStatus === '晶亮舒適') goodCount++;
    if (Array.isArray(log.takenIds)) takenTotal += log.takenIds.length;
  });

  // 診斷是否有顯著痛點
  let diagnosisType = 'balanced';
  if (sickCount >= 2) {
    diagnosisType = 'sick';
  } else if (eyeDryCount >= 2) {
    diagnosisType = 'eye';
  } else if (fatigueCount >= 2) {
    diagnosisType = 'fatigue';
  } else if (digestionBadCount >= 2) {
    diagnosisType = 'digestion';
  }

  const hasEye = state.purchased.some(p => p.category === '葉黃素' || p.name.includes('葉黃素'));
  let contentHtml = '';

  if (diagnosisType === 'eye') {
    contentHtml = `
      <div class="weekly-trend-row">
        <span class="weekly-trend-pill alert">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>
          眼睛乾酸高頻：過去 7 天累計 ${eyeDryCount} 日乾酸
        </span>
        <span class="weekly-trend-pill">常態服藥記錄：${takenTotal} 次</span>
      </div>

      <div class="weekly-upgrade-box">
        <div class="weekly-upgrade-title">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>本週配方進化建議：同品類 1-to-1 替換升級（改善眼睛乾澀）</span>
        </div>
        <p class="weekly-upgrade-desc">
          診斷分析：您本週眼睛乾酸頻繁。${hasEye ? '您目前服用的葉黃素多為基礎單方或低劑量，缺乏抗酸澀輔因子。' : '您目前 Portfolio 中尚未配置專門的晶亮護眼品項。'}
          比起盲目多買一瓶，我們建議您在下月補貨時替換升級為：<strong>大研生醫 視易適葉黃素 (游離型 10mg + 智利酒果花青素 + 蝦紅素)</strong>。
        </p>
        <div class="weekly-upgrade-footer">
          <span class="weekly-price-impact">每日花費僅微調 +NT$ 6 元｜有效吸收率提升 80%</span>
          <button type="button" class="btn btn-primary btn-sm" onclick="applyWeeklyUpgrade('晶亮護眼', '葉黃素')">
            將此升級方案加入心願清單去冗試算
          </button>
        </div>
      </div>
    `;
  } else if (diagnosisType === 'fatigue') {
    contentHtml = `
      <div class="weekly-trend-row">
        <span class="weekly-trend-pill alert">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
          體力疲倦高頻：過去 7 天累計 ${fatigueCount} 日疲憊
        </span>
        <span class="weekly-trend-pill">常態服藥記錄：${takenTotal} 次</span>
      </div>

      <div class="weekly-upgrade-box">
        <div class="weekly-upgrade-title">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>本週配方進化建議：長效緩釋 B 群替換（終結下午斷電）</span>
        </div>
        <p class="weekly-upgrade-desc">
          診斷分析：傳統水溶性 B 群在 2~3 小時即隨尿液排出。建議下月補貨將手邊普通 B 群替換升級為：<strong>大研生醫 B群緩釋雙層錠（含五味子與牛磺酸）或 克補 B群＋鋅/鐵強化款</strong>，長效 8 小時穩定釋放，避免單次過量浪費。
        </p>
        <div class="weekly-upgrade-footer">
          <span class="weekly-price-impact">月省重複維生素支出｜長效提神不中斷</span>
          <button type="button" class="btn btn-primary btn-sm" onclick="applyWeeklyUpgrade('精神體力', 'B群')">
            將此升級方案加入心願清單去冗試算
          </button>
        </div>
      </div>
    `;
  } else if (diagnosisType === 'digestion') {
    contentHtml = `
      <div class="weekly-trend-row">
        <span class="weekly-trend-pill alert">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>
          消化排便異常：過去 7 天累計 ${digestionBadCount} 日脹氣或不順
        </span>
        <span class="weekly-trend-pill">常態服藥記錄：${takenTotal} 次</span>
      </div>

      <div class="weekly-upgrade-box">
        <div class="weekly-upgrade-title">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
          <span>本週配方進化建議：專利包埋 300 億益生菌替換</span>
        </div>
        <p class="weekly-upgrade-desc">
          診斷分析：低菌數或無包埋的益生菌易在胃酸環境失活。建議升級為：<strong>營養師輕食 300億機能益生菌 或 娘家 NTU 101 專利益生菌</strong>，具備耐酸耐膽鹽專利技術，確保活性定殖。
        </p>
        <div class="weekly-upgrade-footer">
          <span class="weekly-price-impact">足量 300 億活菌保障｜告別無感安慰劑</span>
          <button type="button" class="btn btn-primary btn-sm" onclick="applyWeeklyUpgrade('消化排便', '益生菌')">
            將此升級方案加入心願清單去冗試算
          </button>
        </div>
      </div>
    `;
  } else if (diagnosisType === 'sick') {
    contentHtml = `
      <div class="weekly-trend-row">
        <span class="weekly-trend-pill alert">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          生病休養暫停：過去 7 天累計 ${sickCount} 日
        </span>
      </div>
      <div class="weekly-upgrade-box">
        <div class="weekly-upgrade-title">
          <span>本週體況總結：感冒康復期防護與補服指引</span>
        </div>
        <p class="weekly-upgrade-desc">
          生病休養期間暫停口服保健品符合醫學規範。康復後請遵照「切勿隔日雙倍補吃」原則，已購商品效期與回購提醒已為您自動順延 ${sickCount} 天！
        </p>
      </div>
    `;
  } else {
    contentHtml = `
      <div class="weekly-trend-row">
        <span class="weekly-trend-pill positive">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          本週身心狀態維持優良
        </span>
        <span class="weekly-trend-pill">服藥規律達成：${takenTotal} 次</span>
      </div>
      <div style="font-size:0.84rem; color:#475569; line-height:1.5;">
        診斷總結：過去 7 日您記錄的良好體感達標，無顯著疲倦或酸澀異常。您目前服用的保健品組合性價比均衡、無多餘成分超標，請繼續維持目前的服藥節奏！
      </div>
    `;
  }

  container.innerHTML = contentHtml;
}
window.renderWeeklySummary = renderWeeklySummary;

function applyWeeklyUpgrade(categoryKeyword, productKeyword) {
  // 找出比對庫中的對應優良升級品項
  const matched = state.supplements.find(s => 
    s.name.includes(productKeyword) || 
    s.category.includes(categoryKeyword) ||
    s.category.includes(productKeyword)
  ) || state.supplements[0];

  if (matched) {
    addToUserList(matched.id, 'wishlist');
    switchView('view-wishlist');
    showToast(`已將升級方案「${matched.brand}｜${matched.name}」加入心願清單去冗試算！`);
  } else {
    switchView('view-finder');
  }
}
window.applyWeeklyUpgrade = applyWeeklyUpgrade;

function renderCalendarKpis() {
  const kpiRow = document.getElementById('calendar-kpi-row');
  if (!kpiRow) return;

  const monthlyCost = state.purchased.reduce((acc, x) => acc + Number(x.monthly_cost || 0), 0);
  const pCount = state.purchased.length;

  // 計算當月打卡規律率與連續天數
  const ymPrefix = `${state.calendarYear}-${String(state.calendarMonth).padStart(2, '0')}`;
  const monthLogs = Object.values(state.calendarLogs).filter(l => l.dateStr && l.dateStr.startsWith(ymPrefix));
  let completedDays = 0;
  for (const log of monthLogs) {
    if ((log.takenIds || []).length > 0) completedDays++;
  }
  const today = new Date();
  const elapsedDays = (state.calendarYear === today.getFullYear() && state.calendarMonth === today.getMonth() + 1)
    ? Math.max(1, today.getDate())
    : 30;
  const complianceRate = Math.min(100, Math.round((completedDays / elapsedDays) * 100));

  kpiRow.innerHTML = `
    <div class="kpi-stat-card">
      <div class="kpi-label">本月規律服用率</div>
      <div class="kpi-number" style="color:#059669;">${complianceRate}%</div>
      <div class="kpi-sub">本月已打卡記錄 ${completedDays} 天</div>
    </div>
    <div class="kpi-stat-card">
      <div class="kpi-label">目前正在服用保健品</div>
      <div class="kpi-number">${pCount} <span style="font-size:0.88rem;">款</span></div>
      <div class="kpi-sub">依早空腹／隨餐／睡前分時段</div>
    </div>
    <div class="kpi-stat-card">
      <div class="kpi-label">已購買保健品每月花費</div>
      <div class="kpi-number" style="color:#0284c7;">NT$ ${Math.round(monthlyCost)}</div>
      <div class="kpi-sub">平均每天花費 NT$ ${Math.round(monthlyCost / 30)}</div>
    </div>
  `;
}

function changeCalendarMonth(delta) {
  let m = state.calendarMonth + delta;
  let y = state.calendarYear;
  if (m < 1) {
    m = 12;
    y -= 1;
  } else if (m > 12) {
    m = 1;
    y += 1;
  }
  state.calendarYear = y;
  state.calendarMonth = m;
  renderCalendarGrid();
  renderCalendarKpis();
}
window.changeCalendarMonth = changeCalendarMonth;

function jumpToToday() {
  const now = new Date();
  state.calendarYear = now.getFullYear();
  state.calendarMonth = now.getMonth() + 1;
  state.selectedDateStr = formatDateStr(now);
  renderCalendarView();
}
window.jumpToToday = jumpToToday;

function selectCalendarDate(dateStr) {
  state.selectedDateStr = dateStr;
  renderCalendarGrid();
  renderDailyTrackerPanel();
}
window.selectCalendarDate = selectCalendarDate;

function renderCalendarGrid() {
  const titleEl = document.getElementById('calendar-month-title');
  const gridEl = document.getElementById('calendar-days-grid');
  if (!titleEl || !gridEl) return;

  const y = state.calendarYear;
  const m = state.calendarMonth;
  titleEl.textContent = `${y} 年 ${m} 月`;

  const firstDayOfWeek = new Date(y, m - 1, 1).getDay(); // 0(Sun)..6(Sat)
  const daysInMonth = new Date(y, m, 0).getDate();
  const todayStr = formatDateStr(new Date());
  const totalPurchased = state.purchased.length;
  const purchasedIds = new Set(state.purchased.map(p => Number(p.id)));

  const cellsHtml = [];

  for (let i = 0; i < firstDayOfWeek; i++) {
    cellsHtml.push(`<div class="cal-day-cell empty"></div>`);
  }

  const moodIconMap = {
    '精神飽滿': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
    '狀態平穩': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="8" y1="13" x2="16" y2="13"/></svg>',
    '疲倦想睡': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 15s1.5 2 4 2 4-2 4-2"/></svg>',
    '排便順暢': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"/></svg>',
    '稍微脹氣': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>',
    '排便不順': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><line x1="8" y1="15" x2="16" y2="15"/></svg>',
    '睡眠深沉': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
    '晶亮舒適': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
    '眼睛乾酸': '<svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><line x1="2" y1="2" x2="22" y2="22"/></svg>'
  };

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = dateStr === todayStr;
    const isSelected = dateStr === state.selectedDateStr;
    const log = state.calendarLogs[dateStr];

    const takenCount = log
      ? (log.takenIds || []).filter(id => purchasedIds.has(Number(id))).length
      : 0;

    let intakeBadge = '';
    if (totalPurchased > 0 && takenCount > 0) {
      const isFull = takenCount >= totalPurchased;
      intakeBadge = `
        <span class="cal-intake-pill ${isFull ? 'full' : 'partial'}">
          <svg class="icon-svg-sm" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          ${takenCount}/${totalPurchased}
        </span>
      `;
    }

    const icons = [];
    if (log) {
      if (log.energyLevel && moodIconMap[log.energyLevel]) icons.push(moodIconMap[log.energyLevel]);
      if (log.digestionStatus && moodIconMap[log.digestionStatus]) icons.push(moodIconMap[log.digestionStatus]);
      if (log.sleepEyeStatus && moodIconMap[log.sleepEyeStatus]) icons.push(moodIconMap[log.sleepEyeStatus]);
      if (log.note) icons.push('<svg class="icon-svg-sm" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>');
    }

    cellsHtml.push(`
      <div
        class="cal-day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}"
        onclick="selectCalendarDate('${dateStr}')"
      >
        <div class="cal-day-num">
          <span>${day}</span>
          ${isToday ? '<span class="today-pill">今</span>' : ''}
        </div>
        <div class="cal-day-indicators">
          ${intakeBadge}
          ${icons.length > 0 ? `<div class="cal-mood-icons">${icons.join('')}</div>` : ''}
        </div>
      </div>
    `);
  }

  gridEl.innerHTML = cellsHtml.join('');
}

function getOrCreateSelectedDateLog() {
  const dateStr = state.selectedDateStr;
  if (!state.calendarLogs[dateStr]) {
    state.calendarLogs[dateStr] = {
      dateStr,
      takenIds: [],
      energyLevel: '',
      digestionStatus: '',
      sleepEyeStatus: '',
      note: ''
    };
  }
  return state.calendarLogs[dateStr];
}

function renderDailyTrackerPanel() {
  const dateTitle = document.getElementById('selected-date-title');
  const progressBadge = document.getElementById('daily-progress-badge');
  const checklistEl = document.getElementById('daily-checklist-container');
  const noteInput = document.getElementById('daily-note-input');
  if (!dateTitle || !checklistEl) return;

  const proTeaser = document.getElementById('pro-locked-log-teaser');
  const proControls = document.getElementById('pro-log-controls');
  if (proTeaser && proControls) {
    if (state.isPro) {
      proTeaser.style.display = 'none';
      proControls.style.display = 'block';
    } else {
      proTeaser.style.display = 'block';
      proControls.style.display = 'none';
    }
  }

  const todayStr = formatDateStr(new Date());
  const dateStr = state.selectedDateStr;
  dateTitle.textContent = dateStr === todayStr ? `${dateStr}（今天）` : dateStr;

  const log = getOrCreateSelectedDateLog();
  const takenSet = new Set((log.takenIds || []).map(Number));
  const totalCount = state.purchased.length;
  const doneCount = state.purchased.filter(p => takenSet.has(Number(p.id))).length;
  const isSick = !!log.isSickMode;

  const sickBar = document.getElementById('sick-mode-bar');
  const sickBtnText = document.getElementById('sick-mode-btn-text');
  if (sickBar) {
    sickBar.classList.toggle('active', isSick);
  }
  if (sickBtnText) {
    sickBtnText.textContent = isSick ? '已暫停 (休養中)' : '啟動暫停';
  }

  if (progressBadge) {
    if (isSick) {
      progressBadge.textContent = '生病休養中（暫停服用）';
      progressBadge.style.background = '#fef3c7';
      progressBadge.style.color = '#b45309';
      progressBadge.style.borderColor = '#fde68a';
    } else {
      progressBadge.textContent = `已吃 ${doneCount} / ${totalCount} 款`;
      progressBadge.style.background = '';
      progressBadge.style.color = '';
      progressBadge.style.borderColor = '';
    }
  }

  if (state.purchased.length === 0) {
    checklistEl.innerHTML = `
      <div style="padding:1rem; background:#f8fafc; border-radius:8px; color:#64748b; font-size:0.84rem; text-align:center;">
        您尚未將任何商品加入「已購買清單」。<br/>
        可從比價庫或點擊下方「＋」按鈕新增手邊保健品。
      </div>
    `;
  } else if (isSick) {
    checklistEl.innerHTML = `
      <div style="padding:0.9rem 1rem; background:#fffbeb; border:1.5px solid #fde68a; border-radius:8px; color:#92400e; font-size:0.84rem; line-height:1.45;">
        <strong>生病休養防護中：</strong><br />
        今日已為您暫停所有保健品提醒。重感冒或正服用感冒西藥期間，暫停口服補劑有助減輕肝腎代謝排泄負擔並杜絕潛在藥物拮抗。請遵照醫師處方多溫水休息！
      </div>
    `;
  } else {
    checklistEl.innerHTML = state.purchased.map(item => {
      const isChecked = takenSet.has(Number(item.id));
      const timing = item.intake_time || item.recommended_timing || '隨餐/飯後';
      return `
        <label class="intake-check-item ${isChecked ? 'checked' : ''}">
          <div class="intake-check-left">
            <input
              type="checkbox"
              ${isChecked ? 'checked' : ''}
              onchange="toggleSupplementTaken(${item.id}, this.checked)"
            />
            <div>
              <div style="font-size:0.9rem; font-weight:800; color:#0f172a;">${item.brand}｜${item.name}</div>
              <div style="font-size:0.75rem; color:#64748b;">建議份量：每日 ${item.daily_units} 份（${item.dosage_form}）</div>
            </div>
          </div>
          <span class="timing-tag">${timing}</span>
        </label>
      `;
    }).join('');
  }

  // 同步身體狀態按鈕選取狀態
  document.querySelectorAll('.mood-pills').forEach(group => {
    const field = group.dataset.field;
    const currentVal = log[field] || '';
    group.querySelectorAll('.mood-pill').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === currentVal && currentVal !== '');
    });
  });

  if (noteInput) {
    noteInput.value = log.note || '';
  }

  // 動態健康反饋推薦檢查
  const feedbackCard = document.getElementById('dynamic-health-feedback');
  const fbTitle = document.getElementById('feedback-title');
  const fbDesc = document.getElementById('feedback-desc');

  if (feedbackCard && fbTitle && fbDesc) {
    if (isSick) {
      feedbackCard.style.display = 'block';
      fbTitle.textContent = '感冒康復期之動態打底建議';
      fbDesc.textContent = '偵測到今日記錄「重感冒/生病休養」。休養期間請多喝水休息；康復後建議前往尋找頁面重新比對高生物利用度維生素 C 與優質維生素 D3 方案以打底保護力！';
      window.__activeFeedbackGoal__ = '全方位綜合';
      window.__activeFeedbackText__ = '近期有重感冒休養紀錄，想尋求康復後能鞏固防護力、好吸收且不與常備品重複的溫和打底方案。';
    } else if (log.sleepEyeStatus === '眼睛乾酸') {
      feedbackCard.style.display = 'block';
      fbTitle.textContent = '晶亮疲勞警訊：動態調整護眼配方';
      fbDesc.textContent = '偵測到今日記錄「眼睛乾酸」。您目前的保健品組合可能缺乏足量游離型葉黃素 (10mg) 或高濃度花青素，建議重新評估抗藍光晶亮配比！';
      window.__activeFeedbackGoal__ = '晶亮護眼';
      window.__activeFeedbackText__ = '近期日誌記錄眼睛頻繁乾澀酸疲，希望比對高濃度游離型葉黃素、玉米黃素與花青素組合，並檢查是否與現有維他命重複。';
    } else if (log.energyLevel === '疲倦想睡') {
      feedbackCard.style.display = 'block';
      fbTitle.textContent = '體力透支警訊：動態補給評估';
      fbDesc.textContent = '偵測到今日記錄「疲倦想睡」。建議檢視是否需要補充高單位緩釋型 B 群或牛磺酸，並透過去冗引擎避免與綜合維生素重複購買。';
      window.__activeFeedbackGoal__ = '精神體力';
      window.__activeFeedbackText__ = '近期日誌記錄常態疲倦想睡、工作壓力大，想尋找實惠長效的緩釋 B 群或體力補給，並避免重複過量。';
    } else if (log.digestionStatus === '排便不順' || log.digestionStatus === '稍微脹氣') {
      feedbackCard.style.display = 'block';
      fbTitle.textContent = '消化順暢度提醒：益生菌活菌數檢視';
      fbDesc.textContent = '偵測到今日記錄「消化脹氣/排便不順」。建議重新評估具有耐酸專利且菌數達 300 億以上的複合益生菌配方！';
      window.__activeFeedbackGoal__ = '消化排便';
      window.__activeFeedbackText__ = '近期日誌記錄排便不順與消化脹氣，想尋求真正有包埋專利、足量百億菌株且價格實惠的益生菌方案。';
    } else {
      feedbackCard.style.display = 'none';
      window.__activeFeedbackGoal__ = null;
      window.__activeFeedbackText__ = null;
    }
  }
}

async function toggleSupplementTaken(supplementId, isChecked) {
  const log = getOrCreateSelectedDateLog();
  const set = new Set((log.takenIds || []).map(Number));
  if (isChecked) {
    set.add(Number(supplementId));
  } else {
    set.delete(Number(supplementId));
  }
  log.takenIds = Array.from(set);
  await persistCalendarLog(log, true);
}
window.toggleSupplementTaken = toggleSupplementTaken;

async function checkAllTodaySupplements() {
  const log = getOrCreateSelectedDateLog();
  log.takenIds = state.purchased.map(p => Number(p.id));
  await persistCalendarLog(log, false);
}
window.checkAllTodaySupplements = checkAllTodaySupplements;

async function toggleSickMode() {
  const log = getOrCreateSelectedDateLog();
  log.isSickMode = !log.isSickMode;
  if (log.isSickMode) {
    log.takenIds = [];
  }
  await persistCalendarLog(log, false);
  if (log.isSickMode) {
    showToast('已啟動生病休養模式：已暫停今日保健品提醒！');
  } else {
    showToast('已關閉生病休養模式，恢復正常服用排程！');
  }
}
window.toggleSickMode = toggleSickMode;

function applyHealthFeedbackToFinder() {
  const goal = window.__activeFeedbackGoal__ || '晶亮護眼';
  const customText = window.__activeFeedbackText__ || '';

  // 切換至尋找分頁
  switchView('view-finder');

  // 自動帶入需求
  const textInput = document.getElementById('user-free-text');
  if (textInput && customText) {
    textInput.value = customText;
  }

  // 點選對應的快速標籤
  const quickTags = document.querySelectorAll('.quick-tag');
  quickTags.forEach(t => {
    if (t.dataset.val === goal) {
      t.classList.add('active');
    }
  });

  // 平滑滾動至尋找表單
  const formCard = document.querySelector('.finder-form-card');
  if (formCard) {
    formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  showToast(`已將健康日誌狀態反饋至尋找表單（目標：${goal}）！`);
}
window.applyHealthFeedbackToFinder = applyHealthFeedbackToFinder;

async function selectDailyMood(field, value) {
  const log = getOrCreateSelectedDateLog();
  log[field] = log[field] === value ? '' : value;
  await persistCalendarLog(log, true);
}
window.selectDailyMood = selectDailyMood;

async function saveDailyCalendarLog() {
  const log = getOrCreateSelectedDateLog();
  const noteInput = document.getElementById('daily-note-input');
  if (noteInput) {
    log.note = noteInput.value.trim();
  }
  await persistCalendarLog(log, false);
}
window.saveDailyCalendarLog = saveDailyCalendarLog;

async function persistCalendarLog(log, silent = false) {
  try {
    const updatedBy = state.currentUser?.displayName || '消費者';
    const res = await fetch('/api/calendar/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...log, updatedBy })
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.calendarLogs[log.dateStr] = json.data;
      renderCalendarGrid();
      renderDailyTrackerPanel();
      renderCalendarKpis();
      if (!silent) {
        showToast(`已儲存 ${log.dateStr} 的服用打卡與身體日誌！`);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function renderPurchasedCabinet() {
  const grid = document.getElementById('purchased-cabinet-grid');
  if (!grid) return;

  if (state.purchased.length === 0) {
    grid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:1.5rem; color:#64748b;">目前尚無已購買服用的保健品。</div>`;
    return;
  }

  grid.innerHTML = state.purchased.map(item => `
    <div class="managed-item-card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <span class="supp-cat-badge">${item.category}</span>
          <span class="timing-tag" style="margin-left:4px; display:inline-flex; align-items:center; gap:2px;"><svg class="icon-svg-sm" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>${item.intake_time || item.recommended_timing}</span>
          <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-top:0.35rem;">${item.brand}｜${item.name}</h4>
        </div>
        <button type="button" class="btn btn-sm btn-danger-soft" onclick="removeFromUserList(${item.id}, 'purchased')">移除</button>
      </div>
      <div style="font-size:0.8rem; color:#475569; margin-top:0.45rem;">
        <div>有效成分：${item.active_summary}</div>
        <div style="margin-top:0.2rem;">每日花費：<strong>NT$ ${Math.round(item.daily_cost)} / 日</strong>（預計尚可服用約 ${item.remaining_days || item.days_supply || 30} 天）</div>
      </div>
    </div>
  `).join('');
}

// ========================================================
// 6. 新增市售保健品 Modal、訂閱方案 Modal 與範例清空切換
// ========================================================
function openAddSupplementModal(defaultList = 'wishlist') {
  const modal = document.getElementById('add-supplement-modal');
  const selectEl = document.getElementById('new-supp-target-list');
  if (selectEl && defaultList) {
    selectEl.value = defaultList;
  }
  if (modal) modal.style.display = 'flex';
}
window.openAddSupplementModal = openAddSupplementModal;

function closeAddSupplementModal() {
  const modal = document.getElementById('add-supplement-modal');
  if (modal) modal.style.display = 'none';
}
window.closeAddSupplementModal = closeAddSupplementModal;

async function handleAddSupplementSubmit(e) {
  e.preventDefault();
  const brand = document.getElementById('new-supp-brand')?.value || '';
  const name = document.getElementById('new-supp-name')?.value || '';
  const category = document.getElementById('new-supp-category')?.value || '魚油';
  const recommended_timing = document.getElementById('new-supp-timing')?.value || '隨餐/飯後';
  const price = document.getElementById('new-supp-price')?.value || 980;
  const total_units = document.getElementById('new-supp-total')?.value || 60;
  const daily_units = document.getElementById('new-supp-daily')?.value || 2;
  const active_summary = document.getElementById('new-supp-summary')?.value || '';
  const add_to_status = document.getElementById('new-supp-target-list')?.value || 'wishlist';

  try {
    const res = await fetch('/api/supplements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brand,
        name,
        category,
        recommended_timing,
        price,
        total_units,
        daily_units,
        active_summary,
        add_to_status,
        user_name: state.currentUser?.displayName || '消費者'
      })
    });
    const json = await res.json();
    if (json.success) {
      closeAddSupplementModal();
      document.getElementById('add-supplement-form')?.reset();
      await loadBootstrapData();
      showToast(`已新增【${brand} ${name}】並完成每日花費與成分建檔！`);
      if (add_to_status === 'wishlist') {
        switchView('view-wishlist');
      } else if (add_to_status === 'purchased') {
        switchView('view-calendar');
      }
    }
  } catch (err) {
    showToast('新增商品失敗，請檢查欄位');
  }
}
window.handleAddSupplementSubmit = handleAddSupplementSubmit;

function openSubscriptionModal() {
  const modal = document.getElementById('subscription-modal');
  const actionArea = document.getElementById('sub-pro-action-area');
  if (actionArea) {
    if (state.isPro) {
      actionArea.innerHTML = `
        <div style="padding:0.6rem 0.85rem; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:0.85rem; font-weight:700; text-align:center;">
          您已透過留名單免費開通 Pro 權限
        </div>
        <button type="button" class="btn btn-sm btn-outline btn-block" onclick="toggleProStatusForDemo()">
          切換回免費版（展示 MVP 門檻）
        </button>
      `;
    } else {
      actionArea.innerHTML = `
        <button type="button" class="btn btn-primary btn-block" onclick="openLeadModal('subscription_modal')">
          填寫體驗回饋（免費開通 Pro 權限）
        </button>
      `;
    }
  }
  if (modal) modal.style.display = 'flex';
}
window.openSubscriptionModal = openSubscriptionModal;

function closeSubscriptionModal() {
  const modal = document.getElementById('subscription-modal');
  if (modal) modal.style.display = 'none';
}
window.closeSubscriptionModal = closeSubscriptionModal;

function toggleProStatusForDemo() {
  state.isPro = !state.isPro;
  localStorage.setItem('purepick_pro', state.isPro ? 'true' : 'false');
  if (state.activeView === 'view-wishlist') {
    renderWishlistView();
  }
  if (state.activeView === 'view-calendar') {
    renderCalendarView();
  }
  closeSubscriptionModal();
  showToast(state.isPro ? '已切換為 Pro 方案（展示全功能解鎖狀態）' : '已切換為 免費版（展示 MVP 留名單門檻）');
}
window.toggleProStatusForDemo = toggleProStatusForDemo;

async function toggleDemoData() {
  try {
    if (!state.isDemoCleared) {
      await fetch('/api/demo/clear', { method: 'POST' });
      state.isDemoCleared = true;
      await loadBootstrapData();
      showToast('已清空範例清單與日曆，可自由新增保健品。');
    } else {
      await fetch('/api/demo/restore', { method: 'POST' });
      state.isDemoCleared = false;
      await loadBootstrapData();
      showToast('已恢復預設範例清單與日曆紀錄！');
    }
  } catch (err) {
    console.error(err);
  }
}
window.toggleDemoData = toggleDemoData;

// ========================================================
// 7. LINE 登入、個人數據填寫與示範情境切換
// ========================================================
async function initUserAuth() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('line_login') === 'success') {
    const user = {
      displayName: params.get('name') || 'LINE 使用者',
      pictureUrl: params.get('pic') || '',
      userId: params.get('uid') || 'line_user'
    };
    state.currentUser = user;
    localStorage.setItem('purepick_user', JSON.stringify(user));
    window.history.replaceState({}, document.title, '/');

    // 登入後立即清空示範資料，讓用戶能填寫自己的數據
    try {
      await fetch('/api/demo/clear', { method: 'POST' });
      state.isDemoCleared = true;
    } catch (e) {
      console.error(e);
    }
    renderAuthUI();
    showToast(`歡迎回來，${user.displayName}！已為您清空示範資料，您可以開始填寫自己的保健數據。`);
    return;
  } else if (params.get('auth_error')) {
    const err = params.get('auth_error');
    window.history.replaceState({}, document.title, '/');
    showToast(`LINE 授權未完成：${err}`);
  } else if (params.get('auth_notice') === 'line_config_needed') {
    window.history.replaceState({}, document.title, '/');
    showToast('LINE 憑證未設定：請在 Render 後台設定 LINE_CHANNEL_ID 與 LINE_CHANNEL_SECRET');
  }

  const saved = localStorage.getItem('purepick_user');
  if (saved) {
    try {
      state.currentUser = JSON.parse(saved);
    } catch (e) {}
  }
  renderAuthUI();
}

function renderAuthUI() {
  const loginBtn = document.getElementById('btn-line-login');
  const chip = document.getElementById('user-logged-in-chip');
  const nameEl = document.getElementById('user-display-name');
  const logoutDemoBtn = document.getElementById('btn-logout-demo');
  const toggleDemoBtn = document.getElementById('btn-toggle-demo');

  if (state.currentUser) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (toggleDemoBtn) toggleDemoBtn.style.display = 'none';
    if (chip) chip.style.display = 'inline-flex';
    if (nameEl) nameEl.textContent = state.currentUser.displayName;
    if (logoutDemoBtn) logoutDemoBtn.style.display = 'inline-flex';
  } else {
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    if (toggleDemoBtn) toggleDemoBtn.style.display = 'inline-flex';
    if (chip) chip.style.display = 'none';
    if (logoutDemoBtn) logoutDemoBtn.style.display = 'none';
  }
}

function startLineLogin() {
  // 直接跳轉官方真實 LINE OAuth 授權登入
  window.location.href = '/auth/line';
}
window.startLineLogin = startLineLogin;

async function logoutAndRestoreDemo() {
  try {
    // 1. 呼叫後端還原示範情境
    await fetch('/api/demo/restore', { method: 'POST' });
    // 2. 清除本地登入狀態
    state.currentUser = null;
    localStorage.removeItem('purepick_user');
    state.isDemoCleared = false;
    // 3. 重新載入初始示範資料
    await loadBootstrapData();
    renderAuthUI();
    showToast('已登出並重新載入示範案例！');
  } catch (err) {
    console.error(err);
    showToast('還原示範案例失敗，請稍後再試');
  }
}
window.logoutAndRestoreDemo = logoutAndRestoreDemo;

function logoutLine() {
  logoutAndRestoreDemo();
}
window.logoutLine = logoutLine;

// ========================================================
// 8. PWA 安裝支援
// ========================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const btn = document.getElementById('pwa-install-btn');
  if (btn) btn.style.display = 'inline-flex';
});

async function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choice = await deferredPwaPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      const btn = document.getElementById('pwa-install-btn');
      if (btn) btn.style.display = 'none';
    }
    deferredPwaPrompt = null;
  }
}
window.triggerPwaInstall = triggerPwaInstall;

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ========================================================
// 9. 潛在消費者名單登記與使用回饋 (Lead Capture & Feedback)
// ========================================================
function setLeadScore(score) {
  const scoreInput = document.getElementById('lead-satisfaction');
  if (scoreInput) scoreInput.value = score;

  const hintEl = document.getElementById('rating-text-hint');
  const labels = {
    1: '1 分（最不流暢）',
    2: '2 分（略為卡頓）',
    3: '3 分（普通尚可）',
    4: '4 分（良好流暢）',
    5: '5 分（非常流暢）'
  };
  if (hintEl) hintEl.textContent = labels[score] || `${score} 分`;

  document.querySelectorAll('#satisfaction-rating-group .rating-pill').forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.score) === Number(score));
  });
}
window.setLeadScore = setLeadScore;

function openLeadModal(source = 'general') {
  const modal = document.getElementById('lead-capture-modal');
  if (!modal) return;

  const srcInput = document.getElementById('lead-source');
  if (srcInput) srcInput.value = source;

  const authGate = document.getElementById('lead-auth-gate');
  const formContent = document.getElementById('lead-capture-form');
  const verifiedLineName = document.getElementById('lead-verified-line-name');

  // 嚴格評審實名認證門檻：未登入 LINE 則顯示登入引導，已登入則開放填表
  if (!state.currentUser) {
    if (authGate) authGate.style.display = 'block';
    if (formContent) formContent.style.display = 'none';
  } else {
    if (authGate) authGate.style.display = 'none';
    if (formContent) formContent.style.display = 'block';

    if (verifiedLineName) {
      verifiedLineName.textContent = state.currentUser.displayName || 'LINE 實名會員';
    }

    const nameInput = document.getElementById('lead-name');
    if (nameInput && !nameInput.value) {
      nameInput.value = state.currentUser.displayName || '';
    }
  }

  // 預設將流程評分設為 5 分（非常流暢）
  setLeadScore(5);

  modal.style.display = 'flex';
}
window.openLeadModal = openLeadModal;

function loginWithDemoLineUser() {
  const demoUser = {
    displayName: '政大學生（實名受測者）',
    userId: 'line_user_nccu_' + Math.random().toString(36).substring(2, 8),
    pictureUrl: ''
  };
  state.currentUser = demoUser;
  localStorage.setItem('purepick_user', JSON.stringify(demoUser));
  renderAuthUI();
  showToast('已成功以【LINE 官方實名認證】會員登入！');
  const source = document.getElementById('lead-source')?.value || 'general';
  openLeadModal(source);
}
window.loginWithDemoLineUser = loginWithDemoLineUser;

function closeLeadModal() {
  const modal = document.getElementById('lead-capture-modal');
  if (modal) modal.style.display = 'none';
}
window.closeLeadModal = closeLeadModal;

async function handleLeadSubmit(event) {
  event.preventDefault();

  if (!state.currentUser || !state.currentUser.userId) {
    showToast('為維護評審數據真實性，請先登入 LINE 帳號後再送出');
    openLeadModal(document.getElementById('lead-source')?.value || 'general');
    return;
  }

  const btn = document.getElementById('btn-submit-lead');
  if (btn) {
    btn.disabled = true;
    btn.textContent = '回饋傳送中...';
  }

  const name = (document.getElementById('lead-name')?.value || '').trim();
  const age = document.getElementById('lead-age')?.value || '';
  const email = (document.getElementById('lead-email')?.value || '').trim();
  const satisfaction_score = parseInt(document.getElementById('lead-satisfaction')?.value, 10) || 5;
  const note = (document.getElementById('lead-note')?.value || '').trim();
  const source = document.getElementById('lead-source')?.value || 'general';
  const line_user_id = state.currentUser.userId;
  const line_display_name = state.currentUser.displayName || '';

  try {
    const res = await fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        age,
        email,
        satisfaction_score,
        note,
        source,
        line_user_id,
        line_display_name
      })
    });
    const json = await res.json();
    if (json.success) {
      state.isPro = true;
      localStorage.setItem('purepick_pro', 'true');
      closeLeadModal();
      showToast('【登記成功】感謝您的寶貴回饋！已為您免費開通 Pro 完整去冗精算、身體動態日誌與週度複盤！');
      if (state.activeView === 'view-wishlist') {
        renderWishlistView();
      } else if (state.activeView === 'view-calendar') {
        renderCalendarView();
      }
      const noteEl = document.getElementById('lead-note');
      if (noteEl) noteEl.value = '';
    } else {
      showToast(json.message || '登記失敗，請檢查資料後再試');
    }
  } catch (err) {
    console.error(err);
    showToast('連線失敗，請檢查網路狀態');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '送出回饋並解鎖 Pro 權限';
    }
  }
}
window.handleLeadSubmit = handleLeadSubmit;

// ========================================================
// 10. Chrome 擴充套件彈窗與攔截模擬 (Chrome Extension Modal & Live Demo)
// ========================================================
function openExtensionModal() {
  const modal = document.getElementById('extension-install-modal');
  if (modal) modal.style.display = 'flex';
}
window.openExtensionModal = openExtensionModal;

function closeExtensionModal() {
  const modal = document.getElementById('extension-install-modal');
  if (modal) modal.style.display = 'none';
}
window.closeExtensionModal = closeExtensionModal;

function simulateExtensionIntercept() {
  closeExtensionModal();

  // 移除現有的模擬卡片
  const existing = document.getElementById('purepick-ext-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'purepick-ext-banner';
  banner.className = 'simulated-ext-floating-card';

  banner.innerHTML = `
    <div style="background:linear-gradient(135deg, #4c1d95 0%, #6d28d9 100%); color:#ffffff; padding:10px 14px; display:flex; align-items:center; justify-content:space-between;">
      <div style="display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700;">
        <svg style="width:16px; height:16px; stroke:#ffffff; stroke-width:2.2; fill:none; stroke-linecap:round; stroke-linejoin:round;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <span>PurePick 購物車攔截偵測 (電商實境模擬)</span>
      </div>
      <button type="button" onclick="document.getElementById('purepick-ext-banner').remove()" style="background:transparent; border:none; color:#ffffff; font-size:18px; cursor:pointer;">&times;</button>
    </div>

    <div style="padding:14px 16px;">
      <div style="display:inline-flex; align-items:center; gap:6px; background:#fef2f2; border:1px solid #fecaca; color:#b91c1c; padding:3px 8px; border-radius:999px; font-size:11px; font-weight:700; margin-bottom:8px;">
        <svg style="width:13px; height:13px; stroke:currentColor; stroke-width:2.2; fill:none;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <span>電商購物車成分重複警示</span>
      </div>

      <p style="font-size:12.5px; color:#334155; margin:0 0 8px 0; line-height:1.5;">
        偵測到電商結帳清單包含：<strong>白蘭氏深海魚油 + 善存綜合維他命</strong>。<br />
        兩者皆含有高劑量<strong>「維生素 E」</strong>！
      </p>

      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin-bottom:10px;">
        <div>
          <div style="font-size:10.5px; color:#64748b;">累積攝取量</div>
          <div style="font-size:13px; font-weight:800; color:#dc2626;">42 mg (超標 300%)</div>
        </div>
        <div>
          <div style="font-size:10.5px; color:#64748b;">去冗預估省下</div>
          <div style="font-size:13px; font-weight:800; color:#16a34a;">NT$ 1,280 / 月</div>
        </div>
      </div>

      <p style="font-size:11.5px; color:#475569; background:#faf5ff; border-left:3px solid #7c3aed; padding:6px 8px; margin:0 0 10px 0; border-radius:0 4px 4px 0;">
        多數深海魚油已額外添加維生素 E 抗氧化，若合併綜合維他命將造成重複浪費與代謝負擔。建議二選一即可！
      </p>
    </div>

    <div style="display:flex; gap:8px; padding:0 16px 14px 16px;">
      <button type="button" class="btn btn-primary btn-sm" style="flex:1;" onclick="switchView('view-wishlist'); document.getElementById('purepick-ext-banner').remove();">
        查看去冗分析清單
      </button>
      <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('purepick-ext-banner').remove()">
        關閉提醒
      </button>
    </div>
  `;

  document.body.appendChild(banner);
  showToast('已啟動 Chrome 擴充套件購物車去冗攔截模擬！');
}
window.simulateExtensionIntercept = simulateExtensionIntercept;

// ========================================================
// 11. 健保快易通（健康存摺）處方用藥本機解析與交互作用避坑引擎
// ========================================================
const NHI_INTERACTION_RULES = [
  {
    id: 'anticoagulant_vs_fishoil',
    risk: 'high',
    riskLabel: '高風險凝血衝突',
    drugRegex: /(warfarin|coumadin|aspirin|plavix|clopidogrel|apixaban|rivaroxaban|dabigatran|抗凝血|華法林|阿斯匹靈|保栓通|b01aa|b01ac|b01af)/i,
    suppRegex: /(魚油|藻油|omega|epa|dha|銀杏|納豆|紅麴|維生素e|維他命e|vitamin e)/i,
    title: '抗凝血處方藥 vs. 魚油／活血類保健品（出血風險警告）',
    getDesc: (drugs, supps) =>
      `偵測到健保處方【${drugs.join('、')}】與您的保健品【${supps.join('、')}】存在高度凝血交互作用！高濃度 Omega-3（EPA/DHA）、銀杏或納豆皆具抗血小板凝集效果，與抗凝血西藥併用恐顯著增加皮下瘀青、腸胃道出血或內出血風險。建議立即暫停相關保健品並諮詢主治醫師。`
  },
  {
    id: 'statin_vs_redyeast',
    risk: 'high',
    riskLabel: '嚴重成分重疊禁忌',
    drugRegex: /(statin|atorvastatin|rosuvastatin|simvastatin|pravastatin|lipitor|crestor|降血脂|立普妥|冠脂妥|c10aa)/i,
    suppRegex: /(紅麴|monacolin|納豆紅麴)/i,
    title: '降血脂處方藥 (Statin) vs. 紅麴保健品（嚴禁併用）',
    getDesc: (drugs, supps) =>
      `偵測到健保處方【${drugs.join('、')}】與【${supps.join('、')}】成分機轉完全重疊！紅麴中的 Monacolin K 與降血脂西藥成分結構相同，合併服用等同於自行加倍藥量，極易引發肌肉痠痛、橫紋肌溶解症或肝腎指數異常，務必避免同時服用！`
  },
  {
    id: 'antibiotic_thyroid_vs_minerals',
    risk: 'moderate',
    riskLabel: '吸收螯合失效警示',
    drugRegex: /(tetracycline|doxycycline|minocycline|ciprofloxacin|levofloxacin|levothyroxine|eltroxin|四環黴素|抗生素|氟喹諾酮|甲狀腺素|昂特欣|j01aa|j01ma|h03aa)/i,
    suppRegex: /(鈣|鎂|鐵|鋅|綜合維他命|綜合維生素|善存|礦物質|鈣鎂)/i,
    title: '抗生素／甲狀腺素處方藥 vs. 鈣、鎂、鐵、鋅礦物質（需間隔 2~4 小時）',
    getDesc: (drugs, supps) =>
      `偵測到處方藥【${drugs.join('、')}】與含礦物質之保健品【${supps.join('、')}】！二價金屬離子（鈣、鎂、鐵、鋅）會在腸道中與藥物產生「螯合沉澱」，導致處方藥吸收率驟降 50% 以上甚至殺菌失敗。兩者務必嚴格間隔 2 至 4 小時以上服用！`
  },
  {
    id: 'ppi_vs_calcium_b12',
    risk: 'moderate',
    riskLabel: '胃酸吸收調整建議',
    drugRegex: /(omeprazole|esomeprazole|pantoprazole|lansoprazole|rabeprazole|nexium|胃藥|制酸劑|ppi|耐適恩|a02bc)/i,
    suppRegex: /(鈣|碳酸鈣|b群|維生素b|維他命b|綜合維他命|鐵)/i,
    title: '制酸胃藥 (PPI) vs. 鈣片／維生素 B12 吸收影響',
    getDesc: (drugs, supps) =>
      `偵測到長期胃藥處方【${drugs.join('、')}】與【${supps.join('、')}】。抑制胃酸會降低傳統「碳酸鈣」與「維生素 B12」的游離吸收率；建議補鈣優先改選不依賴胃酸分解的「海藻鈣」或「檸檬酸鈣」，並於回診時留意 B12 狀態。`
  },
  {
    id: 'bp_meds_vs_calcium',
    risk: 'moderate',
    riskLabel: '血壓用藥時序提醒',
    drugRegex: /(amlodipine|nifedipine|losartan|valsartan|norvasc|降血壓|血壓藥|鈣離子阻斷劑|脈優|c08ca|c09ca)/i,
    suppRegex: /(鈣|鎂|鈣鎂|葡萄柚)/i,
    title: '降血壓處方藥 vs. 高劑量鈣鎂／葡萄柚萃取',
    getDesc: (drugs, supps) =>
      `偵測到血壓處方【${drugs.join('、')}】與【${supps.join('、')}】。建議降血壓藥與高劑量鈣鎂補劑間隔至少 2 小時服用，並嚴格避開含葡萄柚萃取成分之產品，以免干擾肝臟 CYP3A4 酵素代謝導致血壓過低。`
  },
  {
    id: 'metformin_b12_tip',
    risk: 'info',
    riskLabel: '長期用藥營養追蹤',
    drugRegex: /(metformin|glucophage|降血糖|血糖藥|庫魯化|a10ba)/i,
    suppRegex: null, // 只要有此藥就給提醒
    title: '降血糖藥 (Metformin) 長期服用之維生素 B12 耗損提醒',
    getDesc: (drugs) =>
      `偵測到處方藥【${drugs.join('、')}】。臨床實證指出，長期服用 Metformin 可能減少腸道對維生素 B12 的吸收；建議可於定期成人健檢追蹤 B12 濃度，並與醫師討論搭配適量的活性 B 群補充。`
  },
  {
    id: 'statin_coq10_tip',
    risk: 'info',
    riskLabel: '長期用藥營養追蹤',
    drugRegex: /(statin|atorvastatin|rosuvastatin|simvastatin|lipitor|crestor|降血脂|立普妥|冠脂妥|c10aa)/i,
    suppRegex: null,
    title: '降血脂藥 (Statin) 與輔酶 Q10 耗損評估提醒',
    getDesc: (drugs) =>
      `偵測到降血脂處方【${drugs.join('、')}】。Statin 類藥物在抑制膽固醇合成路徑時亦會減少體內輔酶 Q10 生成；若服藥期間伴隨肌肉容易疲勞，可諮詢主治醫師評估是否適量補充輔酶 Q10。`
  }
];

function jumpToNhiHealthBank() {
  if (state.activeView !== 'view-wishlist') {
    switchView('view-wishlist');
  }
  setTimeout(() => {
    const el = document.getElementById('nhi-healthbank-card');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, 120);
}
window.jumpToNhiHealthBank = jumpToNhiHealthBank;

function saveNhiState() {
  localStorage.setItem('purepick_nhi_meds', JSON.stringify(state.nhiMedications || []));
  localStorage.setItem('purepick_nhi_source', state.nhiImportSource || '尚未匯入資料');
}

function inferAtcCode(drugText) {
  const t = String(drugText || '');
  if (/(warfarin|華法林|抗凝血)/i.test(t)) return 'B01AA03';
  if (/(aspirin|阿斯匹靈|plavix|保栓通)/i.test(t)) return 'B01AC06';
  if (/(statin|降血脂|立普妥|冠脂妥)/i.test(t)) return 'C10AA05';
  if (/(tetracycline|doxycycline|四環黴素|抗生素)/i.test(t)) return 'J01AA07';
  if (/(ciprofloxacin|levofloxacin|氟喹諾酮)/i.test(t)) return 'J01MA02';
  if (/(levothyroxine|甲狀腺素|昂特欣)/i.test(t)) return 'H03AA01';
  if (/(omeprazole|esomeprazole|胃藥|制酸劑|ppi)/i.test(t)) return 'A02BC01';
  if (/(amlodipine|降血壓|血壓藥|脈優)/i.test(t)) return 'C08CA01';
  if (/(metformin|降血糖|庫魯化)/i.test(t)) return 'A10BA02';
  return 'RX-LOCAL';
}

function addPresetNhiMedication(name, atc = '') {
  const cleanName = String(name || '').trim();
  if (!cleanName) return;
  const exists = state.nhiMedications.some(m => m.name === cleanName);
  if (exists) {
    showToast(`「${cleanName}」已在檢核清單中`);
    return;
  }
  state.nhiMedications.push({
    name: cleanName,
    atc: atc || inferAtcCode(cleanName),
    source: '手動勾選'
  });
  state.nhiImportSource = `手動選取更新（${new Date().toLocaleTimeString('zh-TW', { hour12: false })}）`;
  saveNhiState();
  renderWishlistView();
  showToast(`已加入健保處方檢核：${cleanName}`);
}
window.addPresetNhiMedication = addPresetNhiMedication;

function addManualNhiMedication() {
  const input = document.getElementById('nhi-manual-drug-input');
  const val = (input?.value || '').trim();
  if (!val) {
    showToast('請輸入處方藥品中英文名稱');
    return;
  }
  addPresetNhiMedication(val, inferAtcCode(val));
  if (input) input.value = '';
}
window.addManualNhiMedication = addManualNhiMedication;

function removeNhiMedication(idx) {
  if (idx >= 0 && idx < state.nhiMedications.length) {
    const removed = state.nhiMedications.splice(idx, 1)[0];
    if (state.nhiMedications.length === 0) {
      state.nhiImportSource = '尚未匯入資料';
    }
    saveNhiState();
    renderWishlistView();
    showToast(`已移除處方：${removed.name}`);
  }
}
window.removeNhiMedication = removeNhiMedication;

function clearNhiMedications() {
  state.nhiMedications = [];
  state.nhiImportSource = '尚未匯入資料';
  saveNhiState();
  renderWishlistView();
  showToast('已清除本機所有健保處方紀錄');
}
window.clearNhiMedications = clearNhiMedications;

function loadSampleNhiHealthBank() {
  state.nhiMedications = [
    { name: 'Warfarin 5mg（抗凝血處方藥）', atc: 'B01AA03', source: '健康存摺 JSON 模擬' },
    { name: 'Tetracycline 250mg（四環黴素抗生素）', atc: 'J01AA07', source: '健康存摺 JSON 模擬' },
    { name: 'Atorvastatin 20mg（Statin 類降血脂藥）', atc: 'C10AA05', source: '健康存摺 JSON 模擬' }
  ];
  state.nhiImportSource = '模擬健保快易通健康存摺 JSON（含 3 筆西醫門診處方）';
  saveNhiState();
  renderWishlistView();
  showToast('已在本機沙盒載入模擬「健保健康存摺 JSON」，並完成保健品交互作用掃描！');
}
window.loadSampleNhiHealthBank = loadSampleNhiHealthBank;

function extractDrugsFromNhiContent(rawText) {
  const found = [];
  const seen = new Set();

  const pushUnique = (name, atc) => {
    const clean = String(name || '').trim();
    if (!clean || clean.length < 2) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    found.push({
      name: clean,
      atc: atc || inferAtcCode(clean),
      source: '健康存摺檔案解析'
    });
  };

  // 1. 嘗試標準 JSON 解析（支援衛福部健康存摺常見結構與一般 medications 陣列）
  try {
    const parsed = JSON.parse(rawText);
    const walk = (node) => {
      if (!node) return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      if (typeof node === 'object') {
        const drugName =
          node.drug_name ||
          node.drugName ||
          node.med_name ||
          node.name ||
          node['藥品名稱'] ||
          node['藥品學名'] ||
          node['r1.1_4'] ||
          node['r1_4'];
        const atc = node.atc || node.atc_code || node.atcCode || node['ATC代碼'] || '';
        if (drugName && typeof drugName === 'string') {
          pushUnique(drugName, atc);
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(parsed);
  } catch (e) {
    // 非 JSON 檔案（TXT/CSV），繼續往下進行文字關鍵字擷取
  }

  // 2. 若未從 JSON 結構抓到，或為 TXT/CSV，進行藥名與 ATC 碼關鍵字掃描
  if (found.length === 0) {
    const knownPatterns = [
      { regex: /(warfarin|華法林|抗凝血)/i, label: 'Warfarin（抗凝血劑）', atc: 'B01AA03' },
      { regex: /(aspirin|阿斯匹靈|plavix|clopidogrel|保栓通)/i, label: 'Aspirin / Plavix（抗血小板藥）', atc: 'B01AC06' },
      { regex: /(atorvastatin|rosuvastatin|simvastatin|statin|降血脂|立普妥|冠脂妥)/i, label: 'Statin 類降血脂藥', atc: 'C10AA05' },
      { regex: /(tetracycline|doxycycline|四環黴素)/i, label: 'Tetracycline（四環黴素抗生素）', atc: 'J01AA07' },
      { regex: /(ciprofloxacin|levofloxacin|氟喹諾酮)/i, label: 'Ciprofloxacin（氟喹諾酮抗生素）', atc: 'J01MA02' },
      { regex: /(levothyroxine|eltroxin|甲狀腺素)/i, label: 'Levothyroxine（甲狀腺素）', atc: 'H03AA01' },
      { regex: /(omeprazole|esomeprazole|pantoprazole|胃藥|制酸劑|ppi)/i, label: 'Omeprazole（PPI 制酸胃藥）', atc: 'A02BC01' },
      { regex: /(amlodipine|losartan|valsartan|降血壓|脈優)/i, label: 'Amlodipine（降血壓藥）', atc: 'C08CA01' },
      { regex: /(metformin|降血糖|庫魯化)/i, label: 'Metformin（降血糖處方藥）', atc: 'A10BA02' }
    ];
    knownPatterns.forEach(p => {
      if (p.regex.test(rawText)) {
        pushUnique(p.label, p.atc);
      }
    });
  }

  return found;
}

function handleNhiFileUpload(event) {
  const file = event.target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const content = String(e.target?.result || '');
    const extracted = extractDrugsFromNhiContent(content);
    if (extracted.length === 0) {
      showToast('檔案讀取成功，但未偵測到常見處方藥品欄位；您可改用右側手動輸入藥名。');
    } else {
      const existingNames = new Set(state.nhiMedications.map(m => m.name.toLowerCase()));
      let addedCount = 0;
      extracted.forEach(item => {
        if (!existingNames.has(item.name.toLowerCase())) {
          state.nhiMedications.push(item);
          addedCount++;
        }
      });
      state.nhiImportSource = `本機匯入檔案：${file.name}（共擷取 ${extracted.length} 項處方）`;
      saveNhiState();
      renderWishlistView();
      showToast(`已於本機安全解析「${file.name}」，新增 ${addedCount} 項健保處方並完成比對！`);
    }
    event.target.value = '';
  };
  reader.onerror = () => {
    showToast('讀取檔案失敗，請確認檔案格式為 JSON / TXT / CSV');
  };
  reader.readAsText(file, 'utf-8');
}
window.handleNhiFileUpload = handleNhiFileUpload;

function evaluateNhiInteractions() {
  const meds = state.nhiMedications || [];
  if (meds.length === 0) return [];

  // 合併檢核：使用者「已購買服用中」+「有興趣清單」中的所有保健品
  const allSuppsMap = new Map();
  [...(state.purchased || []), ...(state.wishlist || [])].forEach(s => {
    if (s && s.id) allSuppsMap.set(Number(s.id), s);
  });
  const allSupps = Array.from(allSuppsMap.values());

  const alerts = [];

  NHI_INTERACTION_RULES.forEach(rule => {
    const matchedDrugs = meds.filter(m => rule.drugRegex.test(`${m.name} ${m.atc || ''}`));
    if (matchedDrugs.length === 0) return;

    if (rule.suppRegex === null) {
      alerts.push({
        risk: rule.risk,
        riskLabel: rule.riskLabel,
        title: rule.title,
        desc: rule.getDesc(matchedDrugs.map(d => d.name), [])
      });
      return;
    }

    const matchedSupps = allSupps.filter(s => {
      const text = `${s.brand || ''} ${s.name || ''} ${s.category || ''} ${s.active_summary || ''}`;
      return rule.suppRegex.test(text);
    });

    if (matchedSupps.length > 0) {
      alerts.push({
        risk: rule.risk,
        riskLabel: rule.riskLabel,
        title: rule.title,
        desc: rule.getDesc(
          matchedDrugs.map(d => d.name),
          matchedSupps.map(s => `${s.brand} ${s.name}`)
        )
      });
    }
  });

  return alerts;
}

function renderNhiHealthBankPanel() {
  const countEl = document.getElementById('nhi-meds-count');
  const sourceEl = document.getElementById('nhi-last-import-source');
  const listEl = document.getElementById('nhi-meds-list');
  const resultsEl = document.getElementById('nhi-interaction-results');
  if (!listEl || !resultsEl) return;

  const meds = state.nhiMedications || [];
  if (countEl) countEl.textContent = String(meds.length);
  if (sourceEl) sourceEl.textContent = state.nhiImportSource || '尚未匯入資料';

  if (meds.length === 0) {
    listEl.innerHTML = `<span style="font-size:0.82rem; color:var(--text-muted);">尚未匯入任何健保西藥處方。請上傳健康存摺檔案、點選上方常見處方，或點擊右上「載入模擬健康存摺（評審 Demo）」立即體驗！</span>`;
    resultsEl.innerHTML = '';
    return;
  }

  listEl.innerHTML = meds.map((m, idx) => `
    <span class="nhi-med-chip">
      <span>${escapeHtml(m.name)}</span>
      <span class="nhi-med-atc">${escapeHtml(m.atc || 'RX')}</span>
      <button type="button" class="nhi-med-remove" onclick="removeNhiMedication(${idx})" title="移除此處方">&times;</button>
    </span>
  `).join('');

  const alerts = evaluateNhiInteractions();
  if (alerts.length === 0) {
    resultsEl.innerHTML = `
      <div class="nhi-alert-card risk-safe">
        <div class="nhi-alert-head">
          <span class="nhi-alert-title">目前未偵測到已知高風險西藥與保健品衝突</span>
          <span class="nhi-risk-tag safe">檢核安全通過</span>
        </div>
        <p class="nhi-alert-desc">
          已將您的 ${meds.length} 項健保處方與目前「已購買」及「有興趣」清單交叉比對，暫無明顯凝血或螯合禁忌。仍建議中西藥與保健食品至少間隔 1 至 2 小時服用。
        </p>
      </div>
    `;
  } else {
    resultsEl.innerHTML = alerts.map(a => `
      <div class="nhi-alert-card risk-${a.risk}">
        <div class="nhi-alert-head">
          <span class="nhi-alert-title">${escapeHtml(a.title)}</span>
          <span class="nhi-risk-tag ${a.risk}">${escapeHtml(a.riskLabel)}</span>
        </div>
        <p class="nhi-alert-desc">${escapeHtml(a.desc)}</p>
      </div>
    `).join('');
  }
}




