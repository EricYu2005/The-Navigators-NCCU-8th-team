/**
 * popular-supplements.js
 * 好選保健 PurePick — 「最多人吃的熱門營養品」首頁展示區塊
 *
 * 純靜態示範資料（seed data），不呼叫任何後端或 LLM API。
 * 點「看比價」會切換到下方既有的跨品牌比價庫並套用對應品類篩選。
 */
(function () {
  'use strict';

  // ---------- 靜態示範資料 ----------
  // popularity：示範用相對熱門度（0–100），非真實調查數據
  // catalogCategory：對應既有比價庫 #category-filter-pills 的 data-cat
  const POPULAR_SUPPLEMENTS = [
    {
      id: 'fish-oil',
      name: '魚油',
      en: 'Omega-3 (EPA / DHA)',
      popularity: 96,
      tags: ['外食族', '少吃魚', 'rTG 型態'],
      tip: '比較時看每顆 EPA＋DHA 總量，而不是魚油總毫克數。',
      catalogCategory: '魚油',
      accent: '#0ea5e9'
    },
    {
      id: 'lutein',
      name: '葉黃素',
      en: 'Lutein / Zeaxanthin',
      popularity: 92,
      tags: ['3C 族', '游離型', '玉米黃素'],
      tip: '留意是游離型或酯化型，以及是否搭配玉米黃素。',
      catalogCategory: '葉黃素',
      accent: '#f59e0b'
    },
    {
      id: 'vitamin-b',
      name: '維生素 B 群',
      en: 'Vitamin B Complex',
      popularity: 89,
      tags: ['熬夜加班', '外食', '白天吃'],
      tip: '水溶性維生素，多數人習慣早餐後吃；尿液變黃屬正常代謝。',
      catalogCategory: 'B群',
      accent: '#ef4444'
    },
    {
      id: 'probiotics',
      name: '益生菌',
      en: 'Probiotics',
      popularity: 85,
      tags: ['消化順暢', '菌株編號', 'CFU 數'],
      tip: '看標示的菌株編號與每份活菌數，並留意是否額外加糖。',
      catalogCategory: '益生菌',
      accent: '#10b981'
    },
    {
      id: 'vitamin-d3',
      name: '維生素 D3',
      en: 'Vitamin D3',
      popularity: 80,
      tags: ['少曬太陽', '脂溶性', '隨餐吃'],
      tip: '脂溶性維生素，隨餐吃較好吸收；若同時吃鈣片複方，記得合併計算總量。',
      catalogCategory: '鈣鎂D',
      accent: '#eab308'
    },
    {
      id: 'collagen',
      name: '膠原蛋白',
      en: 'Collagen Peptides',
      popularity: 74,
      tags: ['日常保養', '小分子胜肽', '粉包'],
      tip: '比較每日建議份量的克數與價格，並看是否含糖或香料。',
      catalogCategory: '膠原蛋白',
      accent: '#ec4899'
    },
    {
      id: 'calcium-magnesium',
      name: '鈣鎂',
      en: 'Calcium + Magnesium',
      popularity: 70,
      tags: ['少喝牛奶', '檸檬酸鈣', '睡前'],
      tip: '常見鈣鎂比約 2:1；鈣與鐵劑建議錯開時間吃。',
      catalogCategory: '鈣鎂D',
      accent: '#8b5cf6'
    }
  ];

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function render() {
    const mount = document.getElementById('popular-supplements-section');
    if (!mount) return;

    const cards = POPULAR_SUPPLEMENTS.map((item, idx) => {
      const rank = idx + 1;
      return `
        <article class="pop-card" style="--pop-accent:${item.accent}">
          <div class="pop-card-top">
            <span class="pop-rank ${rank <= 3 ? 'is-top' : ''}">${rank}</span>
            <div class="pop-name">
              <h3>${escapeHtml(item.name)}</h3>
              <span>${escapeHtml(item.en)}</span>
            </div>
          </div>
          <div class="pop-meter" aria-label="示範熱門度 ${item.popularity}">
            <div class="pop-meter-track"><div class="pop-meter-fill" style="width:${item.popularity}%"></div></div>
            <span class="pop-meter-num">${item.popularity}</span>
          </div>
          <ul class="pop-tags">
            ${item.tags.map(t => `<li>${escapeHtml(t)}</li>`).join('')}
          </ul>
          <p class="pop-tip">${escapeHtml(item.tip)}</p>
          <button type="button" class="pop-cta" data-pop-cat="${escapeHtml(item.catalogCategory)}">
            看各品牌比價 <span aria-hidden="true">→</span>
          </button>
        </article>`;
    }).join('');

    mount.innerHTML = `
      <div class="pop-head">
        <div>
          <h2>最多人吃的熱門營養品</h2>
          <p>常見保健品快速認識：先看重點，再到比價庫比較各品牌每日花費。</p>
        </div>
        <span class="pop-demo-pill" title="排行與熱門度為課程展示用靜態資料，非真實市調數據">示範資料</span>
      </div>
      <div class="pop-scroller" role="list">
        ${cards}
      </div>`;
  }

  function goToCatalog(cat) {
    if (typeof window.switchView === 'function') window.switchView('view-finder');
    const pill = document.querySelector(`#category-filter-pills .cat-pill[data-cat="${CSS.escape(cat)}"]`);
    if (pill && typeof window.setCatalogCategory === 'function') {
      const search = document.getElementById('catalog-search-input');
      if (search && search.value) search.value = '';
      window.setCatalogCategory(cat);
    }
    setTimeout(() => {
      const target = document.getElementById('catalog-section-card');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  }

  function init() {
    render();
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pop-cat]');
      if (btn) goToCatalog(btn.dataset.popCat);
    });
  }

  window.PurePickPopularSupplements = { data: POPULAR_SUPPLEMENTS };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
