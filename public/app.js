/**
 * app.js
 * 好選保健 PurePick - 跨品牌保健食品比較、去冗評估與服用日曆管理前端互動邏輯
 */

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
  isDemoCleared: false
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
    if (sortBy === 'daily_asc') return Number(a.daily_cost) - Number(b.daily_cost);
    if (sortBy === 'monthly_asc') return Number(a.monthly_cost) - Number(b.monthly_cost);
    if (sortBy === 'price_asc') return Number(a.price) - Number(b.price);
    return Number(b.value_score) - Number(a.value_score);
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
  const score = Number(item.value_score || 80);
  const scoreClass = score >= 85 ? 'score-high' : 'score-mid';

  return `
    <div class="supp-card ${isTopPick ? 'top-recommended' : ''}">
      <div>
        <div class="supp-top-row">
          <div>
            <span class="supp-cat-badge">${item.category}</span>
            ${isTopPick ? '<span class="supp-cat-badge" style="background:#7c3aed;color:#fff;margin-left:4px;">預算首選</span>' : ''}
            ${item.is_vegan ? '<span class="supp-cat-badge" style="background:#dcfce7;color:#15803d;margin-left:4px;">素食</span>' : ''}
          </div>
          <span class="supp-score-badge ${scoreClass}">綜合效益 ${score} 分</span>
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
        >
          ${inPurchased ? '已在日曆' : '加入日曆'}
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
              轉為已購 (加入日曆)
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
  const alertsHtml = (analysis.redundancyAlerts || []).length === 0
    ? `<div style="padding:0.9rem 1rem; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; color:#065f46; font-size:0.88rem; margin-bottom:1rem;">
         目前有興趣與服用中的商品無重複或衝突，配置精準！
       </div>`
    : (analysis.redundancyAlerts || []).map(alert => `
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

  analysisContainer.innerHTML = `
    <div class="verdict-banner">
      <strong>整體評估：</strong><br/>
      ${analysis.overallVerdict}
    </div>

    <h4 style="font-size:0.96rem; font-weight:800; color:#0f172a; margin-bottom:0.6rem;">
      1. 跨商品重疊去冗建議（有興趣清單 vs. 已購買服用中）
    </h4>
    ${alertsHtml}

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
  `;
}

// ========================================================
// 5. 【功能三：管理 B - 已購買清單與月經日曆式服用追蹤】
// ========================================================
function renderCalendarView() {
  renderCalendarKpis();
  renderCalendarGrid();
  renderDailyTrackerPanel();
  renderPurchasedCabinet();
}

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

  const todayStr = formatDateStr(new Date());
  const dateStr = state.selectedDateStr;
  dateTitle.textContent = dateStr === todayStr ? `${dateStr}（今天）` : dateStr;

  const log = getOrCreateSelectedDateLog();
  const takenSet = new Set((log.takenIds || []).map(Number));
  const totalCount = state.purchased.length;
  const doneCount = state.purchased.filter(p => takenSet.has(Number(p.id))).length;

  if (progressBadge) {
    progressBadge.textContent = `已吃 ${doneCount} / ${totalCount} 款`;
  }

  if (state.purchased.length === 0) {
    checklistEl.innerHTML = `
      <div style="padding:1rem; background:#f8fafc; border-radius:8px; color:#64748b; font-size:0.84rem; text-align:center;">
        您尚未將任何商品加入「已購買清單」。<br/>
        可從比價庫或點擊下方「＋」按鈕新增手邊保健品。
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
  if (modal) modal.style.display = 'flex';
}
window.openSubscriptionModal = openSubscriptionModal;

function closeSubscriptionModal() {
  const modal = document.getElementById('subscription-modal');
  if (modal) modal.style.display = 'none';
}
window.closeSubscriptionModal = closeSubscriptionModal;

function activateDemoProPlan() {
  closeSubscriptionModal();
  showToast('已啟用消費者訂閱權益（去冗精算＋完整日曆）');
}
window.activateDemoProPlan = activateDemoProPlan;

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
  } else if (params.get('auth_notice') === 'line_config_needed') {
    window.history.replaceState({}, document.title, '/');
    openLineLoginModal();
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
  openLineLoginModal();
}
window.startLineLogin = startLineLogin;

function openLineLoginModal() {
  const modal = document.getElementById('line-login-modal');
  if (modal) modal.style.display = 'flex';
}
window.openLineLoginModal = openLineLoginModal;

function closeLineLoginModal() {
  const modal = document.getElementById('line-login-modal');
  if (modal) modal.style.display = 'none';
}
window.closeLineLoginModal = closeLineLoginModal;

async function submitQuickLineLogin() {
  const nameInput = document.getElementById('mock-line-name');
  const roleName = (nameInput?.value || '政大創創組員').trim();

  try {
    const res = await fetch('/api/auth/mock-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleName })
    });
    const json = await res.json();
    if (json.success && json.data) {
      state.currentUser = json.data;
      localStorage.setItem('purepick_user', JSON.stringify(json.data));

      // 只要登入就清空資料，讓用戶能填寫自己的數據
      await fetch('/api/demo/clear', { method: 'POST' });
      state.isDemoCleared = true;
      await loadBootstrapData();

      renderAuthUI();
      closeLineLoginModal();
      showToast(`已登入【${json.data.displayName}】！已為您清空示範資料，現在可以開始記錄自己的保健品。`);
    }
  } catch (err) {
    console.error(err);
    showToast('登入過程發生錯誤，請稍後再試');
  }
}
window.submitQuickLineLogin = submitQuickLineLogin;

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
