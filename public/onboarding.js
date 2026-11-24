/**
 * onboarding.js
 * 好選保健 PurePick — Duolingo 風格 3 步驟新手引導 ＋ 首頁「為你推薦」快速入口
 *
 * - 首次進入顯示；完成或略過後寫入 localStorage，下次直接進首頁
 * - 網址帶 ?onboarding=1 可強制重跑（展示用）
 * - 首頁快速入口右上角「重設偏好」可清除紀錄並重跑
 * - 純前端，不呼叫任何後端 API，不讀寫 app.js 既有的 localStorage key
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'purepick_onboarding_v1';
  const TOTAL_STEPS = 3;

  // ---------- 題目設定 ----------
  const STEPS = [
    {
      key: 'goal',
      title: '你最想先做什麼？',
      subtitle: '我們會依照你的答案，把最適合的功能放在首頁。',
      options: [
        { value: 'dedupe', title: '檢查有沒有買重複', desc: '比對正在吃的和想買的保健品' },
        { value: 'compare', title: '比價與找方案', desc: '看看不同品牌每天要花多少錢' },
        { value: 'organize', title: '整理我正在吃的保健品', desc: '建立服用清單，方便打卡或看診時出示' }
      ]
    },
    {
      key: 'dailyCount',
      title: '你目前每天大概吃幾種保健品？',
      subtitle: '幫你抓出最適合的檢視方式。',
      options: [
        { value: 'none', title: '還沒開始吃，想先研究', desc: '先看看大家都吃什麼' },
        { value: '1_2', title: '1–2 種', desc: '基礎保養' },
        { value: '3_4', title: '3–4 種', desc: '進階搭配' },
        { value: '5_plus', title: '5 種以上', desc: '需要防重複與控預算' },
        {
          value: 'custom', title: '自己填寫', desc: '輸入確切數量',
          custom: { unit: '種', placeholder: '例如 3', integer: true, inputMode: 'numeric', error: '請輸入 0 或以上的整數' }
        }
      ]
    },
    {
      key: 'monthlyBudget',
      title: '你一個月大概花多少錢在保健品上？',
      subtitle: '協助比對 CP 值與節省空間。',
      options: [
        { value: 'under_500', title: '500 元以下', desc: '小資基礎打底' },
        { value: '500_1500', title: '500 – 1,500 元', desc: '1–2 項核心保養' },
        { value: '1500_3000', title: '1,500 – 3,000 元', desc: '多項完整搭配' },
        { value: 'above_3000', title: '3,000 元以上', desc: '全方位、重視規格' },
        {
          value: 'custom', title: '自己填寫', desc: '輸入每月大約金額',
          custom: { unit: '元／月', placeholder: '例如 1200', integer: false, inputMode: 'decimal', error: '請輸入 0 或以上的數字' }
        }
      ]
    }
  ];

  // ---------- 首頁快速入口設定（對應第 1 題） ----------
  const QUICK_ACTIONS = {
    dedupe: {
      title: '檢查有沒有買重複',
      desc: '把想買的和正在吃的放在一起比，抓出重複成分與超量風險。',
      cta: '前往重複檢查',
      icon: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
      tabTarget: 'view-wishlist'
    },
    compare: {
      title: '比價與找方案',
      desc: '跨品牌比較每日、每月花費，找出 CP 值最高的組合。',
      cta: '前往比價庫',
      icon: '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      tabTarget: null
    },
    organize: {
      title: '整理我正在吃的保健品',
      desc: '建立服用清單與每日打卡，看診時一鍵出示給醫生。',
      cta: '前往服用日曆',
      icon: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4"/><path d="M8 2v4"/><path d="M3 10h18"/><path d="m9 16 2 2 4-4"/>',
      tabTarget: 'view-calendar'
    }
  };
  const DEFAULT_ORDER = ['compare', 'dedupe', 'organize'];

  // ---------- 吉祥物 SVG（上淡黃、下薄荷綠、深色描邊、微笑） ----------
  const MASCOT_SVG = `
    <svg class="onb-mascot-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <ellipse cx="60" cy="110" rx="26" ry="5" fill="#1f2937" opacity="0.08"/>
      <g transform="rotate(-18 60 60)">
        <path d="M36 58 V36 a24 24 0 0 1 48 0 V58 Z" fill="#fde68a"/>
        <path d="M36 58 V84 a24 24 0 0 0 48 0 V58 Z" fill="#a7f3d0"/>
        <rect x="36" y="12" width="48" height="96" rx="24" fill="none" stroke="#1f2937" stroke-width="4"/>
        <line x1="36" y1="58" x2="84" y2="58" stroke="#1f2937" stroke-width="4"/>
        <path d="M45 30 q4 -8 12 -10" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
        <circle cx="51" cy="70" r="4" fill="#1f2937"/>
        <circle cx="69" cy="70" r="4" fill="#1f2937"/>
        <circle cx="52.4" cy="68.6" r="1.3" fill="#fff"/>
        <circle cx="70.4" cy="68.6" r="1.3" fill="#fff"/>
        <path d="M52 80 q8 7 16 0" fill="none" stroke="#1f2937" stroke-width="3.5" stroke-linecap="round"/>
        <ellipse cx="44" cy="78" rx="4" ry="2.5" fill="#fb7185" opacity="0.45"/>
        <ellipse cx="76" cy="78" rx="4" ry="2.5" fill="#fb7185" opacity="0.45"/>
      </g>
    </svg>`;

  // ---------- localStorage 工具 ----------
  function readPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writePrefs(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {
      // 無痕模式或儲存空間已滿：僅本次有效，不影響使用
    }
  }

  function clearPrefs() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---------- 引導流程狀態 ----------
  const flow = {
    step: 0,
    answers: { goal: null, dailyCount: null, monthlyBudget: null },
    customText: { dailyCount: '', monthlyBudget: '' },
    root: null,
    prevBodyOverflow: ''
  };

  function isCustomValid(stepIdx, text) {
    const opt = STEPS[stepIdx].options.find(o => o.custom);
    const t = String(text || '').trim();
    if (!t) return false;
    const re = opt.custom.integer ? /^\d+$/ : /^\d+(\.\d+)?$/;
    if (!re.test(t)) return false;
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 && n <= 1000000;
  }

  function isStepValid(stepIdx) {
    const key = STEPS[stepIdx].key;
    const val = flow.answers[key];
    if (!val) return false;
    if (val === 'custom') return isCustomValid(stepIdx, flow.customText[key]);
    return true;
  }

  function buildAnswerPayload() {
    const a = flow.answers;
    const pick = (stepIdx) => {
      const key = STEPS[stepIdx].key;
      const val = a[key];
      if (!val) return null;
      const opt = STEPS[stepIdx].options.find(o => o.value === val);
      const out = { option: val, label: opt ? opt.title : val };
      if (val === 'custom') {
        out.value = Number(String(flow.customText[key]).trim());
        out.unit = opt.custom.unit;
      }
      return out;
    };
    return {
      goal: a.goal,
      dailyCount: pick(1),
      monthlyBudget: pick(2)
    };
  }

  // ---------- 畫面建構 ----------
  function buildShell() {
    const root = document.createElement('div');
    root.className = 'onb-overlay';
    root.id = 'onboarding-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'onb-question-title');
    root.innerHTML = `
      <div class="onb-shell">
        <header class="onb-top">
          <div class="onb-brand">
            <span class="onb-brand-dot" aria-hidden="true"></span>
            <span>好選保健 PurePick</span>
          </div>
          <button type="button" class="onb-skip" data-onb="skip">略過</button>
        </header>

        <div class="onb-progress-row">
          <div class="onb-progress" role="progressbar" aria-valuemin="1" aria-valuemax="${TOTAL_STEPS}" aria-valuenow="1" aria-label="引導進度">
            <div class="onb-progress-fill"></div>
          </div>
          <span class="onb-step-num" aria-live="polite">1 / ${TOTAL_STEPS}</span>
        </div>

        <div class="onb-stage"></div>

        <footer class="onb-bottom">
          <div class="onb-nav">
            <button type="button" class="onb-btn onb-btn-back" data-onb="back">上一步</button>
            <button type="button" class="onb-btn onb-btn-next" data-onb="next" disabled>下一步</button>
          </div>
          <p class="onb-privacy">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
            免登入，答案只儲存在這個瀏覽器。
          </p>
        </footer>
      </div>`;
    return root;
  }

  function renderStep(direction) {
    const stepIdx = flow.step;
    const cfg = STEPS[stepIdx];
    const stage = flow.root.querySelector('.onb-stage');
    const selected = flow.answers[cfg.key];

    const optionsHtml = cfg.options.map(opt => {
      const isSel = selected === opt.value;
      const customHtml = opt.custom ? `
        <div class="onb-custom-wrap" ${isSel ? '' : 'hidden'}>
          <div class="onb-custom-field">
            <input type="text" class="onb-custom-input" data-key="${cfg.key}"
              inputmode="${opt.custom.inputMode}" autocomplete="off"
              placeholder="${escapeHtml(opt.custom.placeholder)}"
              aria-label="${escapeHtml(opt.title)}（單位：${escapeHtml(opt.custom.unit)}）"
              value="${escapeHtml(flow.customText[cfg.key])}" />
            <span class="onb-custom-unit">${escapeHtml(opt.custom.unit)}</span>
          </div>
          <p class="onb-custom-error" hidden>${escapeHtml(opt.custom.error)}</p>
        </div>` : '';
      return `
        <div class="onb-option ${isSel ? 'is-selected' : ''} ${opt.custom ? 'has-custom' : ''}"
             role="radio" tabindex="0" aria-checked="${isSel}" data-value="${opt.value}">
          <div class="onb-option-main">
            <span class="onb-radio" aria-hidden="true"><span class="onb-radio-dot"></span></span>
            <span class="onb-option-text">
              <strong>${escapeHtml(opt.title)}</strong>
              <span>${escapeHtml(opt.desc)}</span>
            </span>
          </div>
          ${customHtml}
        </div>`;
    }).join('');

    const panel = document.createElement('section');
    panel.className = 'onb-panel';
    if (direction) panel.classList.add(direction === 'forward' ? 'enter-forward' : 'enter-back');
    panel.innerHTML = `
      <div class="onb-question">
        <div class="onb-mascot">${MASCOT_SVG}</div>
        <div class="onb-question-text">
          <h2 id="onb-question-title">${escapeHtml(cfg.title)}</h2>
          <p>${escapeHtml(cfg.subtitle)}</p>
        </div>
      </div>
      <div class="onb-options" role="radiogroup" aria-labelledby="onb-question-title">
        ${optionsHtml}
      </div>`;

    const old = stage.querySelector('.onb-panel');
    if (old && direction) {
      old.classList.add(direction === 'forward' ? 'leave-forward' : 'leave-back');
      old.addEventListener('animationend', () => old.remove(), { once: true });
      setTimeout(() => old.remove(), 450); // 動畫保險
    } else if (old) {
      old.remove();
    }
    stage.appendChild(panel);
    stage.scrollTop = 0;

    updateChrome();
  }

  function updateChrome() {
    const stepIdx = flow.step;
    const fill = flow.root.querySelector('.onb-progress-fill');
    const bar = flow.root.querySelector('.onb-progress');
    const num = flow.root.querySelector('.onb-step-num');
    const back = flow.root.querySelector('[data-onb="back"]');
    const next = flow.root.querySelector('[data-onb="next"]');

    fill.style.width = `${((stepIdx + 1) / TOTAL_STEPS) * 100}%`;
    bar.setAttribute('aria-valuenow', String(stepIdx + 1));
    num.textContent = `${stepIdx + 1} / ${TOTAL_STEPS}`;
    back.classList.toggle('is-hidden', stepIdx === 0);
    back.disabled = stepIdx === 0;
    next.textContent = stepIdx === TOTAL_STEPS - 1 ? '完成' : '下一步';
    next.disabled = !isStepValid(stepIdx);
  }

  function updateCustomError() {
    const key = STEPS[flow.step].key;
    const panel = flow.root.querySelector('.onb-panel:last-child');
    if (!panel) return;
    const err = panel.querySelector('.onb-custom-error');
    const input = panel.querySelector('.onb-custom-input');
    if (!err || !input) return;
    const text = flow.customText[key];
    const showErr = flow.answers[key] === 'custom' && String(text).trim() !== '' && !isCustomValid(flow.step, text);
    err.hidden = !showErr;
    input.classList.toggle('is-invalid', showErr);
  }

  function selectOption(optionEl) {
    const cfg = STEPS[flow.step];
    const value = optionEl.dataset.value;
    flow.answers[cfg.key] = value;

    const panel = optionEl.closest('.onb-panel');
    panel.querySelectorAll('.onb-option').forEach(el => {
      const on = el === optionEl;
      el.classList.toggle('is-selected', on);
      el.setAttribute('aria-checked', String(on));
      const wrap = el.querySelector('.onb-custom-wrap');
      if (wrap) wrap.hidden = !on;
    });
    optionEl.classList.remove('pop');
    void optionEl.offsetWidth; // 重新觸發動畫
    optionEl.classList.add('pop');

    if (value === 'custom') {
      const input = optionEl.querySelector('.onb-custom-input');
      if (input) setTimeout(() => input.focus(), 30);
    }
    updateCustomError();
    updateChrome();
  }

  function goNext() {
    if (!isStepValid(flow.step)) return;
    if (flow.step < TOTAL_STEPS - 1) {
      flow.step += 1;
      renderStep('forward');
    } else {
      finish(false);
    }
  }

  function goBack() {
    if (flow.step === 0) return;
    flow.step -= 1;
    renderStep('back');
  }

  function finish(skipped) {
    const payload = {
      version: 1,
      completed: !skipped,
      skipped: !!skipped,
      answers: buildAnswerPayload(),
      savedAt: new Date().toISOString()
    };
    // 略過時，未完成的自填欄位若無效則不存
    if (skipped) {
      ['dailyCount', 'monthlyBudget'].forEach((k, i) => {
        if (flow.answers[k] === 'custom' && !isCustomValid(i + 1, flow.customText[k])) payload.answers[k] = null;
      });
    }
    writePrefs(payload);
    stripOnboardingParam();
    closeOverlay();
    applyHomePreferences(payload, { announce: !skipped });
  }

  function stripOnboardingParam() {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('onboarding')) {
        url.searchParams.delete('onboarding');
        window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash);
      }
    } catch (e) { /* noop */ }
  }

  function onKeydown(e) {
    if (!flow.root) return;
    const t = e.target;
    if (e.key === 'Enter') {
      if (t.classList && t.classList.contains('onb-custom-input')) {
        e.preventDefault();
        goNext();
      } else if (t.classList && t.classList.contains('onb-option')) {
        e.preventDefault();
        selectOption(t);
      }
    } else if (e.key === ' ' && t.classList && t.classList.contains('onb-option')) {
      e.preventDefault();
      selectOption(t);
    }
  }

  function openOverlay(opts) {
    if (flow.root) return;
    const prev = (opts && opts.prefill) || null;
    flow.step = 0;
    flow.answers = { goal: null, dailyCount: null, monthlyBudget: null };
    flow.customText = { dailyCount: '', monthlyBudget: '' };
    if (prev && prev.answers) {
      // 重跑時帶入上次答案，方便展示時快速修改
      flow.answers.goal = prev.answers.goal || null;
      ['dailyCount', 'monthlyBudget'].forEach(k => {
        const p = prev.answers[k];
        if (p && p.option) {
          flow.answers[k] = p.option;
          if (p.option === 'custom' && p.value !== undefined) flow.customText[k] = String(p.value);
        }
      });
    }

    flow.root = buildShell();
    document.body.appendChild(flow.root);
    flow.prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    flow.root.addEventListener('click', (e) => {
      const action = e.target.closest('[data-onb]');
      if (action) {
        const a = action.dataset.onb;
        if (a === 'skip') finish(true);
        else if (a === 'next') goNext();
        else if (a === 'back') goBack();
        return;
      }
      if (e.target.closest('.onb-custom-wrap')) return; // 點輸入框不重設選取
      const opt = e.target.closest('.onb-option');
      if (opt) selectOption(opt);
    });

    flow.root.addEventListener('input', (e) => {
      if (!e.target.classList.contains('onb-custom-input')) return;
      flow.customText[e.target.dataset.key] = e.target.value;
      updateCustomError();
      updateChrome();
    });

    flow.root.addEventListener('keydown', onKeydown);

    renderStep(null);
    requestAnimationFrame(() => flow.root && flow.root.classList.add('is-open'));
    setTimeout(() => {
      const first = flow.root && flow.root.querySelector('.onb-option');
      if (first) first.focus({ preventScroll: true });
    }, 60);
  }

  function closeOverlay() {
    const root = flow.root;
    if (!root) return;
    flow.root = null;
    document.body.style.overflow = flow.prevBodyOverflow || '';
    root.classList.remove('is-open');
    root.classList.add('is-closing');
    setTimeout(() => root.remove(), 320);
  }

  // ========================================================
  // 首頁「為你推薦」快速入口
  // ========================================================
  function runQuickAction(key) {
    if (key === 'compare') {
      if (typeof window.switchView === 'function') window.switchView('view-finder');
      setTimeout(() => {
        const target = document.getElementById('catalog-section-card');
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
      return;
    }
    const view = QUICK_ACTIONS[key] && QUICK_ACTIONS[key].tabTarget;
    if (view && typeof window.switchView === 'function') window.switchView(view);
  }

  function describeProfile(prefs) {
    if (!prefs || !prefs.answers) return '';
    const parts = [];
    const d = prefs.answers.dailyCount;
    const b = prefs.answers.monthlyBudget;
    if (d) parts.push(d.option === 'custom' ? `每天 ${d.value} 種` : `每天 ${d.label}`);
    if (b) parts.push(b.option === 'custom' ? `每月約 ${Number(b.value).toLocaleString('zh-TW')} 元` : `每月 ${b.label}`);
    return parts.join('・');
  }

  function renderQuickStart(prefs) {
    const mount = document.getElementById('home-quickstart');
    if (!mount) return;
    const goal = prefs && prefs.answers && QUICK_ACTIONS[prefs.answers.goal] ? prefs.answers.goal : null;
    const order = goal ? [goal].concat(DEFAULT_ORDER.filter(k => k !== goal)) : DEFAULT_ORDER.slice();
    const profile = describeProfile(prefs);

    mount.innerHTML = `
      <div class="qs-head">
        <div>
          <h2>${goal ? '為你推薦的起點' : '從這裡開始'}</h2>
          <p>${goal ? `依你的回答把「${escapeHtml(QUICK_ACTIONS[goal].title)}」排在最前面${profile ? `（${escapeHtml(profile)}）` : ''}` : '選一個你現在最需要的功能'}</p>
        </div>
        <button type="button" class="qs-reset" data-qs-reset title="清除新手引導答案並重新開始">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
          重設偏好
        </button>
      </div>
      <div class="qs-grid">
        ${order.map((key, i) => {
          const a = QUICK_ACTIONS[key];
          const rec = goal && i === 0;
          return `
            <button type="button" class="qs-card ${rec ? 'is-recommended' : ''}" data-qs-action="${key}">
              ${rec ? '<span class="qs-badge">為你推薦</span>' : ''}
              <span class="qs-icon"><svg viewBox="0 0 24 24" aria-hidden="true">${a.icon}</svg></span>
              <span class="qs-text">
                <strong>${escapeHtml(a.title)}</strong>
                <span>${escapeHtml(a.desc)}</span>
              </span>
              <span class="qs-cta">${escapeHtml(a.cta)} <span aria-hidden="true">→</span></span>
            </button>`;
        }).join('')}
      </div>`;

    // 底部導覽列對應分頁加上小亮點
    document.querySelectorAll('.b-tab-item.onb-tab-highlight').forEach(el => el.classList.remove('onb-tab-highlight'));
    const tab = goal && QUICK_ACTIONS[goal].tabTarget;
    if (tab) {
      const tabEl = document.querySelector(`.b-tab-item[data-target="${tab}"]`);
      if (tabEl) tabEl.classList.add('onb-tab-highlight');
    }
  }

  function showToast(text) {
    const t = document.createElement('div');
    t.className = 'onb-toast';
    t.setAttribute('role', 'status');
    t.textContent = text;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-show'));
    setTimeout(() => {
      t.classList.remove('is-show');
      setTimeout(() => t.remove(), 300);
    }, 2600);
  }

  function applyHomePreferences(prefs, opts) {
    renderQuickStart(prefs);
    const goal = prefs && prefs.answers && prefs.answers.goal;
    if (goal && typeof window.switchView === 'function') window.switchView('view-finder');
    if (opts && opts.announce && goal) {
      const mount = document.getElementById('home-quickstart');
      if (mount) {
        mount.classList.remove('qs-flash');
        void mount.offsetWidth;
        mount.classList.add('qs-flash');
      }
      showToast('已依你的偏好調整首頁');
    }
  }

  function resetAndRerun() {
    const prev = readPrefs();
    clearPrefs();
    renderQuickStart(null);
    openOverlay({ prefill: prev });
  }

  // ========================================================
  // 啟動
  // ========================================================
  function init() {
    const prefs = readPrefs();
    renderQuickStart(prefs);

    document.addEventListener('click', (e) => {
      const act = e.target.closest('[data-qs-action]');
      if (act) { runQuickAction(act.dataset.qsAction); return; }
      if (e.target.closest('[data-qs-reset]')) resetAndRerun();
    });

    let force = false;
    try { force = new URLSearchParams(window.location.search).get('onboarding') === '1'; } catch (e) { /* noop */ }
    if (force || !prefs) openOverlay({ prefill: force ? prefs : null });
  }

  // 提供給其他模組或主控台展示使用
  window.PurePickOnboarding = {
    open: () => openOverlay({ prefill: readPrefs() }),
    reset: resetAndRerun,
    getPreferences: readPrefs,
    STORAGE_KEY
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
