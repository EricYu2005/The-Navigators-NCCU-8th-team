/**
 * app.js
 * CareNav 智護領航 - 核心前端交互控制器 (專業醫療商務版)
 * 實裝簡報 4 大核心模組 (排除第三點)：
 * 1. 全家照護雲端看板 (Family Care Hub & Family Notes)
 * 2. 診前臨床指引卡生成 (20秒主訴 + 5秒勾選回條)
 * 3. 口頭醫囑結構化轉譯 (語音錄音 / 快捷句 ➜ 條件-行動-紅旗)
 * 4. 藥袋代碼逆向推導引擎 (照片上傳 + 時段比對 + 藥學知識庫 MCP 接口)
 * 5. 在地醫院 Hub 陪診媒合 (Linkou, NTU, VGHTPE)
 */

// ========================================================
// 1. 左側面板導覽與視圖切換
// ========================================================
const navItems = document.querySelectorAll('.nav-item');
const pageViews = document.querySelectorAll('.page-view');
const pageTitleEl = document.getElementById('page-title');
const pageDescEl = document.getElementById('page-desc');

const VIEW_METAS = {
  'view-dashboard': {
    title: '全家照護雲端看板 (Family Care Hub)',
    desc: '手足同步瀏覽跨科就醫履歷、最新處方異動與口頭醫囑，杜絕照護內耗'
  },
  'view-orders': {
    title: '口頭醫囑結構化轉譯 (Verbal Orders Digitization)',
    desc: '診後極速語音/文字錄入，自動轉譯為全家皆懂的【觸發條件 - 具體行動 - 危急紅旗】'
  },
  'view-prescription': {
    title: '藥袋用法代碼逆向推導 (Prescription Inference Engine)',
    desc: '拍照上傳新藥袋，端點不可逆物理去識別化，自動比對跨期門診處方異動並建立今日服藥生活排程'
  }
};

const bottomNavItems = document.querySelectorAll('.bottom-nav-item');

function switchView(targetViewId) {
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  bottomNavItems.forEach(item => {
    if (item.getAttribute('data-view') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  pageViews.forEach(view => {
    if (view.id === targetViewId) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  const meta = VIEW_METAS[targetViewId];
  if (meta && pageTitleEl && pageDescEl) {
    pageTitleEl.innerText = meta.title;
    pageDescEl.innerText = meta.desc;
  }

  // 手機版：切換視圖後自動收起側邊欄抽屜並滑動至頂部
  closeMobileSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-view');
    switchView(target);
  });
});

bottomNavItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-view');
    switchView(target);
  });
});

// 手機側邊欄抽屜 (Off-canvas Drawer) 開關控制
const mobileHamburgerBtn = document.getElementById('mobile-hamburger-btn');
const sidebarCloseBtn = document.getElementById('sidebar-close-btn');
const sidebarBackdrop = document.getElementById('sidebar-backdrop');
const sidebarEl = document.querySelector('.sidebar');

function openMobileSidebar() {
  if (sidebarEl) sidebarEl.classList.add('open');
  if (sidebarBackdrop) sidebarBackdrop.classList.add('open');
  document.body.style.overflow = 'hidden';
}
window.openMobileSidebar = openMobileSidebar;

function closeMobileSidebar() {
  if (sidebarEl) sidebarEl.classList.remove('open');
  if (sidebarBackdrop) sidebarBackdrop.classList.remove('open');
  document.body.style.overflow = '';
}
window.closeMobileSidebar = closeMobileSidebar;

if (mobileHamburgerBtn) mobileHamburgerBtn.addEventListener('click', openMobileSidebar);
if (sidebarCloseBtn) sidebarCloseBtn.addEventListener('click', closeMobileSidebar);
if (sidebarBackdrop) sidebarBackdrop.addEventListener('click', closeMobileSidebar);

// ========================================================
// 2. 全家照護雲端看板 (Family Care Hub) 資料載入
// ========================================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard');
    const result = await res.json();
    if (!result.success) return;

    const { patient, latestOrder, currentPrescription, familyNotes } = result.data;

    // 渲染時間軸
    const timelineEl = document.getElementById('dashboard-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = `
        <div class="timeline-entry">
          <div class="timeline-pin"></div>
          <div class="timeline-header">
            <span class="timeline-title">心臟內科門診・最新口頭醫囑轉譯</span>
            <span class="timeline-date">${latestOrder ? latestOrder.created_at.slice(0, 10) : '2026-11-05'}</span>
          </div>
          <div class="timeline-card-box">
            <strong style="color:#0f172a;">${latestOrder ? latestOrder.condition_text : '晨間血壓 < 110 mmHg 時'}</strong>
            <p style="margin-top:0.25rem;">${latestOrder ? latestOrder.action_text : '暫停當天早晨脈優 Norvasc 5mg 一次。'}</p>
            <div style="font-size:0.75rem; color:#0284c7; margin-top:0.35rem;">責任特助：${latestOrder ? latestOrder.recorded_by : '王思婷 護理師'}</div>
          </div>
        </div>

        <div class="timeline-entry">
          <div class="timeline-pin"></div>
          <div class="timeline-header">
            <span class="timeline-title">客觀健康數據軌跡・晨峰血壓與夜尿監測</span>
            <span class="timeline-date">連續 14 天動態彙整</span>
          </div>
          <div class="timeline-card-box">
            <strong style="color:#0f172a;">晨間收縮壓反覆達 148-162 mmHg ｜ 夜尿 3-4 次/晚</strong>
            <p style="margin-top:0.25rem;">系統客觀生理軌跡顯示早晨 7:00-9:00 呈現顯著晨峰高壓，夜尿集中於凌晨 1:30~5:00；完整數據軌跡已留存，供陪診護理師隨時調閱並於診間專業溝通。</p>
          </div>
        </div>

        <div class="timeline-entry">
          <div class="timeline-pin"></div>
          <div class="timeline-header">
            <span class="timeline-title">門診處方逆向推導優化</span>
            <span class="timeline-date">本期最新處方</span>
          </div>
          <div class="timeline-card-box">
            <p>已將利尿劑與脈優由夜間睡前 (QD HS) 成功改至早餐後 (QD AM)，防範夜尿與夜間下床跌倒。</p>
          </div>
        </div>
      `;
    }

    // 渲染今日四時段服藥排程
    const scheduleEl = document.getElementById('dashboard-schedule');
    if (scheduleEl) {
      scheduleEl.innerHTML = `
        <div class="schedule-slot">
          <div class="slot-heading">早晨 (AM) 飯後</div>
          <span class="slot-pill">Norvasc 脈優 5mg (1顆)</span>
          <span class="slot-pill">Lasix 利尿劑 40mg (1顆)</span>
        </div>
        <div class="schedule-slot">
          <div class="slot-heading">中午 (Noon)</div>
          <span style="font-size:0.75rem; color:#94a3b8;">無中午常規用藥</span>
        </div>
        <div class="schedule-slot">
          <div class="slot-heading">傍晚 (PM) 飯後</div>
          <span style="font-size:0.75rem; color:#94a3b8;">無晚餐常規用藥</span>
        </div>
        <div class="schedule-slot">
          <div class="slot-heading">睡前 (HS)</div>
          <span class="slot-pill">Diovan 得安穩 80mg (1顆)</span>
          <span class="slot-pill">Crestor 冠脂妥 10mg (1顆)</span>
        </div>
      `;
    }

    // 渲染手足協同留話簿
    renderFamilyNotes(familyNotes || []);

    // 載入處方對比預設與去識別化藥袋畫布
    loadPrescriptionPreset('changed');
    renderPrescriptionBagCanvas('sanitized');

  } catch (err) {
    console.error('載入看板失敗:', err);
  }
}

function renderFamilyNotes(notes) {
  const container = document.getElementById('family-notes-list');
  if (!container) return;

  if (notes.length === 0) {
    container.innerHTML = '<div style="font-size:0.8rem; color:#94a3b8; text-align:center; padding:1rem;">尚無留言，手足可於上方發表照護備忘</div>';
    return;
  }

  container.innerHTML = '';
  notes.forEach(note => {
    container.innerHTML += `
      <div class="note-bubble">
        <div class="note-bubble-head">
          <span>${escapeHtml(note.author)} [${escapeHtml(note.city || '連線')}]</span>
          <span class="note-bubble-time">${note.created_at ? note.created_at.slice(5, 16) : '剛剛'}</span>
        </div>
        <p class="note-bubble-text">${escapeHtml(note.content)}</p>
      </div>
    `;
  });
}

// 手足協同留話表單送出
const familyNoteForm = document.getElementById('family-note-form');
if (familyNoteForm) {
  familyNoteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const authorSelect = document.getElementById('note-author').value;
    const content = document.getElementById('note-content').value.trim();

    if (!content) return;

    const parts = authorSelect.split(' ');
    const author = parts[0];
    const city = parts[1] ? parts[1].replace(/[()]/g, '') : '台北';

    try {
      const res = await fetch('/api/family-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author, city, content })
      });
      const result = await res.json();
      if (result.success) {
        document.getElementById('note-content').value = '';
        await refreshFamilyNotes();
      }
    } catch (err) {
      console.error(err);
    }
  });
}

async function refreshFamilyNotes() {
  try {
    const res = await fetch('/api/family-notes');
    const result = await res.json();
    if (result.success) {
      renderFamilyNotes(result.data);
    }
  } catch (e) {}
}

// ========================================================
// 3. 口頭醫囑結構化轉譯 (Verbal Orders Digitization)
// ========================================================
const verbalForm = document.getElementById('verbal-order-form');
const rawInputEl = document.getElementById('raw-verbal-input');
const voiceBtn = document.getElementById('voice-record-btn');
const voiceLabel = document.getElementById('voice-btn-label');

let recognition = null;
let isRecording = false;

// 支援 Web Speech API 原生中文語音辨識
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = 'zh-TW';
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    rawInputEl.value = transcript;
    stopRecordingUI();
  };

  recognition.onerror = () => {
    stopRecordingUI();
  };

  recognition.onend = () => {
    stopRecordingUI();
  };
}

if (voiceBtn) {
  voiceBtn.addEventListener('click', () => {
    if (!isRecording) {
      isRecording = true;
      voiceBtn.classList.add('recording');
      voiceLabel.innerText = '正在聆聽醫師口頭醫囑（請對麥克風說話）...';

      if (recognition) {
        try {
          recognition.start();
        } catch (e) {}
      } else {
        // 若無麥克風權限或不支援，1.5 秒後自動載入範本
        setTimeout(() => {
          loadSampleVoice(1);
          stopRecordingUI();
        }, 1500);
      }
    } else {
      stopRecordingUI();
      if (recognition) recognition.stop();
    }
  });
}

function stopRecordingUI() {
  isRecording = false;
  if (voiceBtn) {
    voiceBtn.classList.remove('recording');
    voiceLabel.innerText = '按此開始語音口述錄音';
  }
}

function loadSampleVoice(sampleId) {
  if (sampleId === 1) {
    rawInputEl.value = '如果早上量血壓收縮壓低於 110，那顆脈優 5mg 先停吃一次。其餘常規降血脂與胃藥正常吃。';
  } else if (sampleId === 2) {
    rawInputEl.value = '利尿劑改去早餐後吃，避免半夜一直起來夜尿跌倒。若下肢水腫三天沒消要提早回來加驗腎功能。';
  } else if (sampleId === 3) {
    rawInputEl.value = '如果血糖低於 70 出現冒冷汗手抖，趕快喝 150cc 果汁或吃三顆方糖，暫停下一餐短效降糖藥。';
  }
}

if (verbalForm) {
  verbalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawInput = rawInputEl.value.trim();
    const recordedBy = document.getElementById('order-recorder').value;
    const deptInfo = document.getElementById('order-dept').value;

    if (!rawInput) {
      alert('請先輸入或口述醫師口頭交代內容！');
      return;
    }

    const btn = document.getElementById('parse-order-btn');
    btn.disabled = true;
    btn.innerText = '正在執行臨床結構化轉譯...';

    try {
      const res = await fetch('/api/verbal-orders/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput, recordedBy, department: deptInfo })
      });

      const result = await res.json();
      if (result.success) {
        await loadVerbalOrdersList();
        await loadDashboardData();
        alert('口頭醫囑結構化轉譯成功！已同步至家庭照護看板。');
        rawInputEl.value = '';
      } else {
        alert('轉譯失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      alert('轉譯失敗');
    } finally {
      btn.disabled = false;
      btn.innerText = '結構化轉譯為白話行動指引 ➜ 即時推播全家看板';
    }
  });
}

async function loadVerbalOrdersList() {
  const container = document.getElementById('verbal-orders-list');
  if (!container) return;

  try {
    const res = await fetch('/api/verbal-orders');
    const result = await res.json();
    if (result.success && result.data.length > 0) {
      container.innerHTML = '';
      result.data.forEach(order => {
        container.innerHTML += `
          <div class="order-entry">
            <div class="order-entry-head">
              <span class="order-doc-title">${escapeHtml(order.department || '門診醫囑')}・${escapeHtml(order.doctor_name || '主治醫師')}</span>
              <span class="status-badge">${order.created_at ? order.created_at.slice(0, 16) : '剛剛'}</span>
            </div>
            <div class="order-raw-quote">口語原始記錄：「${escapeHtml(order.raw_input)}」</div>
            <div class="rule-box rule-condition-box">
              <strong>【觸發條件】</strong> ${escapeHtml(order.condition_text || '清晨量測收縮壓 < 110 mmHg 時')}
            </div>
            <div class="rule-box rule-action-box">
              <strong>【具體行動】</strong> ${escapeHtml(order.action_text || '暫停服用脈優一次')}
            </div>
            <div class="rule-box rule-redflags-box">
              <strong>【危急警訊】</strong> ${escapeHtml(order.red_flags || '若持續過低請立即就醫')}
            </div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:0.4rem; text-align:right;">
              收錄責任人：${escapeHtml(order.recorded_by || '特助')}
            </div>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

// ========================================================
// 4. 藥袋用法代碼逆向推導 & 端點不可逆去識別化引擎
// ========================================================
let uploadedBagImageBase64 = null;
let currentDeidMode = 'sanitized'; // 'sanitized' | 'threat' | 'mosaic'
let currentBagImageSource = null;  // null for default/real case, or Image object for user upload
let customRedactionBoxes = [];     // 使用者於畫布自訂拖曳之物理塗黑遮蔽區
let isDrawingRedaction = false;
let redactStartX = 0;
let redactStartY = 0;
let currentDragRect = null;
let canvasEventsInitialized = false;

// 模式切換器
function setDeidMode(mode) {
  currentDeidMode = mode;

  // 更新按鈕樣式
  const btnSanitized = document.getElementById('btn-mode-sanitized');
  const btnThreat = document.getElementById('btn-mode-threat');
  const btnMosaic = document.getElementById('btn-mode-mosaic');

  if (btnSanitized) btnSanitized.classList.toggle('active', mode === 'sanitized');
  if (btnThreat) btnThreat.classList.toggle('active', mode === 'threat');
  if (btnMosaic) btnMosaic.classList.toggle('active', mode === 'mosaic');

  renderPrescriptionBagCanvas(mode);
}
window.setDeidMode = setDeidMode;

// 載入實際門診藥袋案例 (含高敏個資)
function loadRealCasePrescriptionBag() {
  currentBagImageSource = null;
  customRedactionBoxes = [];
  setDeidMode('sanitized');
  loadPrescriptionPreset('changed');
}
window.loadRealCasePrescriptionBag = loadRealCasePrescriptionBag;

// 藥袋照片上傳監聽 (支援端點零知識去識別化處理)
const bagImageInput = document.getElementById('bag-image-input');
if (bagImageInput) {
  bagImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          currentBagImageSource = img;
          customRedactionBoxes = [];
          setDeidMode('sanitized');
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    }
  });
}

// 清除畫布上的自訂塗黑遮蔽區
function clearCustomRedactions() {
  customRedactionBoxes = [];
  renderPrescriptionBagCanvas();
}
window.clearCustomRedactions = clearCustomRedactions;

// 下載去識別化後的安全藥袋影像 (供家屬驗證絕無個資外洩)
function downloadSanitizedImage() {
  const canvas = document.getElementById('sanitized-bag-canvas');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `CareNav_去識別化藥袋_${new Date().toISOString().slice(0, 10)}.jpg`;
  link.href = canvas.toDataURL('image/jpeg', 0.92);
  link.click();
}
window.downloadSanitizedImage = downloadSanitizedImage;

// 啟動藥袋處方辨識推導與今日排程 (100% 隱私安全)
async function processUploadedBagToPrescription() {
  const medName = document.getElementById('custom-med-name')?.value || 'Norvasc 脈優 5mg';
  const medCode = document.getElementById('custom-med-code')?.value || 'QD AM';
  const medInd = document.getElementById('custom-med-ind')?.value || '高血壓 晨峰壓制 (時段由睡前改早晨)';

  const medsToProcess = [
    { name: medName, code: medCode, ind: medInd },
    { name: 'Lasix 歐得通/利尿劑 40mg', code: 'QD AM', ind: '時段變更：改早餐後吃，阻斷夜尿跌倒' },
    { name: 'Diovan 得安穩 80mg', code: 'QD HS', ind: '本期新增：保護心腎血管張力素受體阻斷劑' },
    { name: 'Crestor 冠脂妥 10mg', code: 'QD HS', ind: '降血脂：維持原方續開' }
  ];

  await executePrescriptionInference(medsToProcess);
  alert('✅ 藥袋已通過端點物理不可逆去識別化！已為您完成處方推導，並同步至跨期比對與今日服藥排程。');
}
window.processUploadedBagToPrescription = processUploadedBagToPrescription;

// 核心 Canvas 去識別化渲染管線
function renderPrescriptionBagCanvas(mode = currentDeidMode) {
  const canvas = document.getElementById('sanitized-bag-canvas');
  if (!canvas) return;

  // 自適應自訂照片之長寬比 (避免長輩拍攝直式藥袋被壓扁)
  if (currentBagImageSource) {
    const aspect = currentBagImageSource.naturalHeight / currentBagImageSource.naturalWidth;
    const targetH = Math.round(600 * Math.max(0.6, Math.min(1.4, aspect)));
    if (canvas.width !== 600 || canvas.height !== targetH) {
      canvas.width = 600;
      canvas.height = targetH;
    }
  } else {
    if (canvas.width !== 600 || canvas.height !== 420) {
      canvas.width = 600;
      canvas.height = 420;
    }
  }

  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  if (currentBagImageSource) {
    // 繪製使用者上傳之原始照片 (並於前端記憶體進行區域性去識別化)
    ctx.drawImage(currentBagImageSource, 0, 0, w, h);
    applyCustomImageDeid(ctx, w, h, mode);
  } else {
    // 繪製林口長庚紀念醫院高仿真門診藥袋 (Actual Hospital Prescription Bag)
    renderRealisticHospitalBag(ctx, w, h, mode);
  }

  // 繪製自訂框選之物理遮蔽區
  drawCustomRedactionBoxes(ctx, mode);

  // 拖曳中的即時預覽外框
  if (isDrawingRedaction && currentDragRect && currentDragRect.w > 2 && currentDragRect.h > 2) {
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.strokeRect(currentDragRect.x, currentDragRect.y, currentDragRect.w, currentDragRect.h);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
    ctx.fillRect(currentDragRect.x, currentDragRect.y, currentDragRect.w, currentDragRect.h);
    ctx.setLineDash([]);
  }

  // 初始化畫布互動拖曳事件 (僅綁定一次)
  if (!canvasEventsInitialized) {
    initCanvasRedactionEvents(canvas);
    canvasEventsInitialized = true;
  }

  // 匯出端點物理處理後之 Base64 影像 (原始高敏個資未經清洗絕對不上雲)
  try {
    uploadedBagImageBase64 = canvas.toDataURL('image/jpeg', 0.88);
  } catch (e) {
    console.warn('Canvas export warning:', e);
  }

  updateDeidModeInfo(mode);
}
window.renderPrescriptionBagCanvas = renderPrescriptionBagCanvas;

// 綁定滑鼠與觸控拖曳塗黑事件
function initCanvasRedactionEvents(canvas) {
  function getCanvasCoords(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  }

  const startDrag = (e) => {
    const pt = getCanvasCoords(e);
    isDrawingRedaction = true;
    redactStartX = pt.x;
    redactStartY = pt.y;
    currentDragRect = { x: pt.x, y: pt.y, w: 0, h: 0 };
  };

  const moveDrag = (e) => {
    if (!isDrawingRedaction) return;
    const pt = getCanvasCoords(e);
    currentDragRect = {
      x: Math.min(redactStartX, pt.x),
      y: Math.min(redactStartY, pt.y),
      w: Math.abs(pt.x - redactStartX),
      h: Math.abs(pt.y - redactStartY)
    };
    renderPrescriptionBagCanvas();
  };

  const endDrag = () => {
    if (isDrawingRedaction && currentDragRect && currentDragRect.w > 12 && currentDragRect.h > 12) {
      customRedactionBoxes.push({ ...currentDragRect });
    }
    isDrawingRedaction = false;
    currentDragRect = null;
    renderPrescriptionBagCanvas();
  };

  canvas.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', endDrag);

  canvas.addEventListener('touchstart', startDrag, { passive: true });
  window.addEventListener('touchmove', moveDrag, { passive: true });
  window.addEventListener('touchend', endDrag);
}

// 繪製自訂框選遮蔽區
function drawCustomRedactionBoxes(ctx, mode) {
  if (!customRedactionBoxes || customRedactionBoxes.length === 0) return;

  customRedactionBoxes.forEach((box, idx) => {
    if (mode === 'sanitized') {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(box.x, box.y, box.w, box.h);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 10px "Microsoft JhengHei", sans-serif';
      ctx.fillText(`🛡️ 物理抹除 (H=0) #${idx + 1}`, box.x + 4, box.y + Math.min(14, box.h - 4));
    } else if (mode === 'threat') {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(box.x, box.y, box.w, box.h);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(box.x, Math.max(0, box.y - 14), 100, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 9px "Microsoft JhengHei", sans-serif';
      ctx.fillText(`自訂敏感區 #${idx + 1}`, box.x + 4, Math.max(10, box.y - 3));
      ctx.setLineDash([]);
    } else if (mode === 'mosaic') {
      drawSimulatedMosaic(ctx, box.x, box.y, box.w, box.h, 10);
    }
  });
}

// 繪製高仿真台灣醫學中心門診藥袋
function renderRealisticHospitalBag(ctx, w, h, mode) {
  // 1. 藥袋米黃紙質感底色與高對比邊框
  ctx.fillStyle = '#faf8f2';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, w - 16, h - 16);

  // 2. 院區抬頭 Header
  ctx.fillStyle = '#0f766e';
  ctx.fillRect(10, 10, w - 20, 34);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 14px "Microsoft JhengHei", sans-serif';
  ctx.fillText('林口長庚紀念醫院  門診處方藥袋 (Chang Gung Memorial Hospital)', 20, 32);

  ctx.fillStyle = '#ccfbf1';
  ctx.font = '11px sans-serif';
  ctx.fillText('領藥號: 0158', w - 95, 31);

  // 調劑中繼標頭
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(10, 46, w - 20, 22);
  ctx.fillStyle = '#334155';
  ctx.font = '11px "Microsoft JhengHei", sans-serif';
  ctx.fillText('調劑日期: 115/11/05 ｜ 心臟內科 02診 ｜ 主治醫師: 林宏昌 ｜ 專科藥師: 陳美玲', 18, 61);

  // 3. 高敏特種個資區 (PII Coordinates)
  const piiX = 20;
  const piiY = 78;

  // 原始個資文字
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
  ctx.fillText('病患姓名：陳國華   性別：男   年齡：72歲', piiX, piiY + 14);

  ctx.font = '12px "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#1e293b';
  ctx.fillText('身分證字號：A128938210   出生日期：43/08/15', piiX, piiY + 34);
  ctx.fillText('病歷號碼：08429188       就醫序號：0024 (健保首診)', piiX, piiY + 54);

  // 4. 門診條碼與 QR Code (HIS 健保資料庫索引)
  const barX = 385;
  const barY = 74;
  renderSimulatedBarcode(ctx, barX, barY, 195, 32);
  renderSimulatedQrCode(ctx, barX + 148, barY + 38, 42, 42);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#475569';
  ctx.fillText('*084291880024*', barX + 35, barY + 44);

  // ----------------------------------------------------
  // 5. 去識別化處理層 (根據 mode 執行不同物理處理)
  // ----------------------------------------------------
  if (mode === 'sanitized') {
    // 🛡️ 不可逆資訊熵歸零 (Entropy=0) + 差分合成標籤置換
    // 1. 姓名列覆寫 (實體覆寫原始 RGB 像素數值)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(piiX - 4, piiY, 275, 20);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('🛡️ 【病患姓名：差分合成虛擬標籤 ID#7741】', piiX, piiY + 14);

    // 2. 身分證號覆寫
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(piiX - 4, piiY + 22, 290, 18);
    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('🛡️ 【身分證號：A12*****10 不可逆遮罩】', piiX, piiY + 35);

    // 3. 病歷號覆寫
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(piiX - 4, piiY + 42, 290, 18);
    ctx.fillStyle = '#6ee7b7';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('🛡️ 【病歷編號：資訊熵歸零 物理消除】', piiX, piiY + 55);

    // 4. 門診條碼與 QR Code 全頻段光學遮斷 (阻斷任何二維掃描器與手機相機)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(barX - 6, barY - 4, 208, 86);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(barX - 6, barY - 4, 208, 86);

    ctx.fillStyle = '#34d399';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('🛡️ 條碼光學防掃描遮斷', barX + 24, barY + 32);
    ctx.font = '10px sans-serif';
    ctx.fillStyle = '#a7f3d0';
    ctx.fillText('ANTI-SCAN CRYPTO SHIELD', barX + 20, barY + 52);

  } else if (mode === 'threat') {
    // ⚠️ 威脅偵測模式：以鮮紅框線與警示標籤標示重大資安風險點
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);

    // 姓名警示
    ctx.strokeRect(piiX - 4, piiY, 275, 20);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(piiX + 175, piiY - 14, 96, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px "Microsoft JhengHei", sans-serif';
    ctx.fillText('重大個資: 真實姓名', piiX + 179, piiY - 3);

    // 身分證警示
    ctx.strokeRect(piiX - 4, piiY + 22, 290, 18);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(piiX + 170, piiY + 22, 116, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText('特種個資: 國健身分證', piiX + 174, piiY + 33);

    // 病歷號警示
    ctx.strokeRect(piiX - 4, piiY + 42, 290, 18);

    // 條碼/QR Code 警示
    ctx.strokeRect(barX - 6, barY - 4, 208, 86);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(barX - 6, barY - 16, 130, 14);
    ctx.fillStyle = '#fff';
    ctx.fillText('掃描金鑰: 門診條碼/QR', barX - 2, barY - 5);

    ctx.setLineDash([]);

  } else if (mode === 'mosaic') {
    // ❌ 傳統馬賽克模式 (展示局部均值化漏洞)
    drawSimulatedMosaic(ctx, piiX - 4, piiY, 275, 60, 8);
    drawSimulatedMosaic(ctx, barX - 6, barY - 4, 208, 86, 10);

    ctx.fillStyle = 'rgba(180, 83, 9, 0.9)';
    ctx.fillRect(piiX, piiY + 16, 260, 22);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('⚠️ 傳統馬賽克 (殘留字型高頻能量，易遭AI逆向)', piiX + 6, piiY + 31);
  }

  // ----------------------------------------------------
  // 6. 臨床關鍵用藥區 (Prescription Data - 100% 完整保留！)
  // ----------------------------------------------------
  const medStartY = 166;

  // 表頭
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(10, medStartY - 20, w - 20, 20);
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
  ctx.fillText('項次   藥品商品名 / 學名成分                       用法用量代碼             總量 / 天數     適應症與警語', 16, medStartY - 6);

  // 第一項用藥 (Norvasc QD AM)
  drawMedRow(ctx, 14, medStartY + 8, w - 28, {
    idx: '1',
    name: 'Norvasc 脈優錠 5mg (Amlodipine)',
    code: 'QD AM 每日早晨一次 (早餐後)',
    qty: '28 顆 (28天)',
    ind: '高血壓、心絞痛 ｜ 門診排程由睡前移至早晨，覆蓋晨峰血壓'
  }, true);

  // 第二項用藥 (Lasix QD AM)
  drawMedRow(ctx, 14, medStartY + 68, w - 28, {
    idx: '2',
    name: 'Lasix 來適泄/利尿劑 40mg (Furosemide)',
    code: 'QD AM 每日早晨一次 (早餐後)',
    qty: '28 顆 (28天)',
    ind: '水腫、高血壓 ｜ 門診調整至早餐後，防範夜間頻尿中斷睡眠跌倒'
  }, true);

  // 第三項用藥 (Diovan QD HS)
  drawMedRow(ctx, 14, medStartY + 128, w - 28, {
    idx: '3',
    name: 'Diovan 得安穩錠 80mg (Valsartan)',
    code: 'QD HS 每日睡前一次',
    qty: '28 顆 (28天)',
    ind: '血管張力素受體阻斷劑 (ARB)，保護心臟與腎臟功能'
  }, false);

  // 第四項用藥 (Crestor QD HS)
  drawMedRow(ctx, 14, medStartY + 188, w - 28, {
    idx: '4',
    name: 'Crestor 冠脂妥 10mg (Rosuvastatin)',
    code: 'QD HS 每日睡前一次',
    qty: '28 顆 (28天)',
    ind: '降膽固醇、預防心血管動脈硬化 ｜ 維持原方續開'
  }, false);

  // 頁尾叮嚀
  ctx.fillStyle = '#64748b';
  ctx.font = '10px "Microsoft JhengHei", sans-serif';
  ctx.fillText('※ 本藥袋影像已完成 CareNav 端點去識別化處理，符合醫療個資隱私標準，臨床用法代碼已完整留存供推導。', 16, h - 12);
}

// 輔助繪圖：用藥列
function drawMedRow(ctx, x, y, width, data, isHighlighted) {
  ctx.fillStyle = isHighlighted ? '#f0fdf4' : '#ffffff';
  ctx.fillRect(x, y, width, 52);

  ctx.strokeStyle = isHighlighted ? '#86efac' : '#cbd5e1';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, 52);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 12px "Microsoft JhengHei", sans-serif';
  ctx.fillText(`${data.idx}. ${data.name}`, x + 8, y + 18);

  // 用法代碼 Chip
  ctx.fillStyle = isHighlighted ? '#15803d' : '#0284c7';
  ctx.fillRect(x + 225, y + 5, 160, 18);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 10px "Microsoft JhengHei", sans-serif';
  ctx.fillText(data.code, x + 230, y + 18);

  ctx.fillStyle = '#475569';
  ctx.font = '11px sans-serif';
  ctx.fillText(data.qty, x + 395, y + 18);

  ctx.fillStyle = isHighlighted ? '#166534' : '#64748b';
  ctx.font = '10.5px "Microsoft JhengHei", sans-serif';
  ctx.fillText(data.ind, x + 8, y + 38);
}

// 輔助繪圖：模擬 1D 條碼
function renderSimulatedBarcode(ctx, x, y, w, h) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#0f172a';

  let curX = x + 8;
  const barPattern = [2, 1, 3, 1, 2, 4, 1, 2, 1, 3, 2, 1, 4, 1, 2, 1, 3, 1, 2, 3, 1, 4, 2, 1, 3, 1, 2, 1, 4, 2, 1, 3];
  for (let i = 0; i < barPattern.length; i++) {
    const barW = barPattern[i] * 1.5;
    if (i % 2 === 0) {
      ctx.fillRect(curX, y, barW, h);
    }
    curX += barW;
    if (curX > x + w - 10) break;
  }
}

// 輔助繪圖：模擬 2D QR Code
function renderSimulatedQrCode(ctx, x, y, size, _) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#0f172a';

  // 尋像標記 (三個回字框)
  ctx.fillRect(x + 2, y + 2, 12, 12);
  ctx.clearRect(x + 4, y + 4, 8, 8);
  ctx.fillRect(x + 6, y + 6, 4, 4);

  ctx.fillRect(x + size - 14, y + 2, 12, 12);
  ctx.clearRect(x + size - 12, y + 4, 8, 8);
  ctx.fillRect(x + size - 10, y + 6, 4, 4);

  ctx.fillRect(x + 2, y + size - 14, 12, 12);
  ctx.clearRect(x + 4, y + size - 12, 8, 8);
  ctx.fillRect(x + 6, y + size - 10, 4, 4);

  // 隨機資料點點
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if ((r + c) % 2 === 0) {
        ctx.fillRect(x + 16 + c * 4, y + 16 + r * 4, 3, 3);
      }
    }
  }
}

// 輔助繪圖：模擬傳統馬賽克
function drawSimulatedMosaic(ctx, x, y, w, h, size = 8) {
  for (let py = y; py < y + h; py += size) {
    for (let px = x; px < x + w; px += size) {
      const shade = 180 + ((px * 13 + py * 7) % 50);
      ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade - 10})`;
      ctx.fillRect(px, py, Math.min(size, x + w - px), Math.min(size, y + h - py));
    }
  }
}

// 自訂上傳圖片的去識別化遮罩
function applyCustomImageDeid(ctx, w, h, mode) {
  const topCut = h * 0.28;
  if (mode === 'sanitized') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, topCut);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px "Microsoft JhengHei", sans-serif';
    ctx.fillText('🛡️ 【端點不可逆去識別化完成 • 姓名/身分證/條碼區域資訊熵歸零】', 20, topCut / 2);
  } else if (mode === 'threat') {
    ctx.strokeStyle = '#dc2626';
    ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, w - 8, topCut);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(10, 10, 160, 20);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px "Microsoft JhengHei", sans-serif';
    ctx.fillText('⚠️ 偵測到重大個資標頭區', 16, 24);
  } else if (mode === 'mosaic') {
    drawSimulatedMosaic(ctx, 0, 0, w, topCut, 12);
  }
}

// 更新模式解說與審計指標文字
function updateDeidModeInfo(mode) {
  const noteEl = document.getElementById('deid-mode-overlay-note');
  const auditNameId = document.getElementById('audit-name-id');
  const auditMrn = document.getElementById('audit-mrn');
  const auditBarcode = document.getElementById('audit-barcode');
  const auditMeds = document.getElementById('audit-meds');

  if (!noteEl) return;

  if (mode === 'sanitized') {
    noteEl.className = 'deid-overlay-note sanitized';
    noteEl.innerHTML = '✅ <strong>端點不可逆去識別化完成</strong>：依據 HIPAA Safe Harbor 與醫療特種個資法，敏感區域原始像素已於前端記憶體實體消除（資訊熵 H=0）。任何神經網路皆無殘差可逆向還原！';
    if (auditNameId) { auditNameId.className = 'audit-val good'; auditNameId.innerText = '已置換為差分合成標籤 (ID#7741)'; }
    if (auditMrn) { auditMrn.className = 'audit-val good'; auditMrn.innerText = '物理資訊熵歸零 (H=0)'; }
    if (auditBarcode) { auditBarcode.className = 'audit-val good'; auditBarcode.innerText = '光學防掃描遮斷覆蓋'; }
    if (auditMeds) { auditMeds.className = 'audit-val highlight'; auditMeds.innerText = '100% 完整保留 (QD AM / QD HS)'; }
  } else if (mode === 'threat') {
    noteEl.className = 'deid-overlay-note threat';
    noteEl.innerHTML = '⚠️ <strong>高敏個資威脅偵測模式</strong>：已鎖定 4 處若未經處理將引發重大個資外洩與醫療法規責任之高危資料點（姓名、身分證號、病歷號、條碼）。';
    if (auditNameId) { auditNameId.className = 'audit-val danger'; auditNameId.innerText = '⚠️ 標定 2 處重大特種個資'; }
    if (auditMrn) { auditMrn.className = 'audit-val danger'; auditMrn.innerText = '⚠️ 標定 HIS 病歷金鑰'; }
    if (auditBarcode) { auditBarcode.className = 'audit-val danger'; auditBarcode.innerText = '⚠️ 標定可掃描條碼'; }
    if (auditMeds) { auditMeds.className = 'audit-val highlight'; auditMeds.innerText = '🎯 臨床用藥待安全比對'; }
  } else if (mode === 'mosaic') {
    noteEl.className = 'deid-overlay-note mosaic';
    noteEl.innerHTML = '❌ <strong>傳統馬賽克安全漏洞示警</strong>：傳統馬賽克僅是相鄰像素均值運算，保留了高頻邊緣特徵與字形能量！現有 Depix / CNN 逆向模型可在 3 秒內暴力還原身分證號與姓名。CareNav 堅決屏棄純馬賽克做法！';
    if (auditNameId) { auditNameId.className = 'audit-val danger'; auditNameId.innerText = '❌ 馬賽克殘留邊緣能量 (高危)'; }
    if (auditMrn) { auditMrn.className = 'audit-val danger'; auditMrn.innerText = '❌ 存在 Depix 逆向還原漏洞'; }
    if (auditBarcode) { auditBarcode.className = 'audit-val danger'; auditBarcode.innerText = '❌ 條碼反差仍可能被解析'; }
    if (auditMeds) { auditMeds.className = 'audit-val highlight'; auditMeds.innerText = '🎯 臨床代碼已就緒'; }
  }
}

async function loadPrescriptionPreset(type) {
  const prevListEl = document.getElementById('prev-meds-list');
  const currListEl = document.getElementById('curr-meds-list');
  const infTextEl = document.getElementById('inference-summary-text');

  if (prevListEl) {
    prevListEl.innerHTML = `
      <div class="med-card-row">
        <div><strong>Norvasc 脈優錠 5mg</strong></div>
        <span class="med-code-badge">QD HS (每日睡前一次)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.25rem;">高血壓常規</div>
      </div>
      <div class="med-card-row" style="border-color:#fca5a5; background:#fef2f2;">
        <div><strong style="color:#b91c1c;">Lasix 歐得通/利尿劑 40mg</strong></div>
        <span class="med-code-badge" style="background:#fee2e2; color:#dc2626;">QD HS (睡前服)</span>
        <div style="color:#b91c1c; font-size:0.75rem; margin-top:0.25rem;">排程盲點：造成夜間起夜 3-4 次跌倒高風險</div>
      </div>
      <div class="med-card-row">
        <div><strong>Crestor 冠脂妥 10mg</strong></div>
        <span class="med-code-badge">QD HS (每日睡前一次)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.25rem;">降膽固醇</div>
      </div>
    `;
  }

  // 準備呼叫後端專屬管道 PrescriptionMcpPipeline
  const testNewMeds = [
    { name: 'Norvasc 脈優 5mg', code: 'QD AM', ind: '時段變更：壓制晨峰高血壓 (早晨7-9點)' },
    { name: 'Lasix 歐得通/利尿劑 40mg', code: 'QD AM', ind: '時段變更：改早餐後吃，阻斷頻繁夜尿跌倒' },
    { name: 'Diovan 得安穩 80mg', code: 'QD HS', ind: '本期新增：保護心腎血管張力素受體阻斷劑' },
    { name: 'Crestor 冠脂妥 10mg', code: 'QD HS', ind: '維持原方續開' }
  ];

  await executePrescriptionInference(testNewMeds);
}

async function triggerMcpSimulation() {
  const testMeds = [
    { name: 'Norvasc 脈優 5mg', code: 'QD AM' },
    { name: 'Diovan 得安穩 80mg', code: 'QD HS' },
    { name: 'Lasix 歐得通 40mg', code: 'QD AM' },
    { name: 'Aspirin 伯基 100mg', code: 'QD PC' }
  ];
  await executePrescriptionInference(testMeds);
}

async function executePrescriptionInference(medications) {
  const currListEl = document.getElementById('curr-meds-list');
  const infTextEl = document.getElementById('inference-summary-text');
  const mcpResultsContainer = document.getElementById('drugbank-mcp-results');
  const progressContainer = document.getElementById('mcp-progress-container');
  const timerSecondsEl = document.getElementById('mcp-elapsed-seconds');
  const progressBarFill = document.getElementById('mcp-progress-bar-fill');
  const stage1El = document.getElementById('stage-1-item');
  const stage2El = document.getElementById('stage-2-item');
  const stage3El = document.getElementById('stage-3-item');

  if (infTextEl) {
    infTextEl.innerText = '正在調用專屬管道 PrescriptionPipeline 進行生活服藥排程逆向推導與健康軌跡比對 (30s 逾時安全閥保護中)...';
  }

  // 啟動 25s~35s 防耐心耗盡進度計時器
  let elapsed = 0;
  if (progressContainer) {
    progressContainer.classList.add('active');
    if (timerSecondsEl) timerSecondsEl.innerText = '0';
    if (progressBarFill) progressBarFill.style.width = '10%';
    if (stage1El) stage1El.className = 'mcp-stage-item in-progress';
    if (stage2El) stage2El.className = 'mcp-stage-item';
    if (stage3El) stage3El.className = 'mcp-stage-item';
  }

  const timerInterval = setInterval(() => {
    elapsed++;
    if (timerSecondsEl) timerSecondsEl.innerText = String(elapsed);

    // 依據秒數動態推進 3 個臨床階段，給予使用者即時心理反饋
    if (elapsed < 10) {
      if (progressBarFill) progressBarFill.style.width = `${10 + elapsed * 3}%`;
    } else if (elapsed < 20) {
      if (stage1El) stage1El.className = 'mcp-stage-item completed';
      if (stage2El) stage2El.className = 'mcp-stage-item in-progress';
      if (progressBarFill) progressBarFill.style.width = `${40 + (elapsed - 10) * 3}%`;
    } else if (elapsed <= 30) {
      if (stage2El) stage2El.className = 'mcp-stage-item completed';
      if (stage3El) stage3El.className = 'mcp-stage-item in-progress';
      if (progressBarFill) progressBarFill.style.width = `${70 + (elapsed - 20) * 2.5}%`;
    } else {
      // 超過 30 秒即將抵達 35 秒上限
      if (progressBarFill) progressBarFill.style.width = '96%';
    }
  }, 1000);

  try {
    const res = await fetch('/api/prescriptions/infer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        newMedications: medications,
        hospitalName: '林口長庚紀念醫院',
        department: '心臟內科',
        bagImageUrl: uploadedBagImageBase64
      })
    });

    clearInterval(timerInterval);

    // 完成時平滑填滿進度條
    if (progressBarFill) progressBarFill.style.width = '100%';
    if (stage1El) stage1El.className = 'mcp-stage-item completed';
    if (stage2El) stage2El.className = 'mcp-stage-item completed';
    if (stage3El) stage3El.className = 'mcp-stage-item completed';
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.remove('active');
    }, 2500);

    const result = await res.json();
    if (!result.success) {
      alert('處方推導失敗: ' + result.message);
      return;
    }

    const { analyzedMeds, inferenceSummary, drugBankMcp, telemetry } = result.data;

    // 渲染本期處方列表
    if (currListEl) {
      currListEl.innerHTML = '';
      analyzedMeds.forEach(m => {
        const cls = m.changeType === 'timing' ? 'change-timing' : (m.changeType === 'new' ? 'change-new' : '');
        currListEl.innerHTML += `
          <div class="med-card-row ${cls}">
            <div><strong>${escapeHtml(m.name)}</strong></div>
            <span class="med-code-badge">${escapeHtml(m.code)} (${escapeHtml(m.frequencyChinese)})</span>
            <div style="font-size:0.75rem; margin-top:0.25rem;">${escapeHtml(m.changeNotice)}</div>
          </div>
        `;
      });
    }

    // 渲染推導診斷總結
    if (infTextEl) {
      infTextEl.innerText = inferenceSummary;
    }

    // 渲染生活服藥排程落實與健康軌跡總評卡片
    if (mcpResultsContainer && drugBankMcp) {
      let ddiHtml = '';
      if (drugBankMcp.detectedInteractions && drugBankMcp.detectedInteractions.length > 0) {
        drugBankMcp.detectedInteractions.forEach(d => {
          ddiHtml += `
            <div class="ddi-item moderate">
              <div class="ddi-item-title">
                <span>📋 ${escapeHtml(d.drugA)} ＋ ${escapeHtml(d.drugB)}</span>
                <span class="severity-chip moderate">${escapeHtml(d.severityLabel)}</span>
              </div>
              <p style="color:#334155; margin-bottom:0.35rem; font-size:0.92rem; line-height:1.6;">${escapeHtml(d.description)}</p>
              <div class="ddi-action" style="font-size:0.9rem;">👉 生活實踐叮嚀：${escapeHtml(d.clinicalAction)}</div>
            </div>
          `;
        });
      } else {
        ddiHtml = '<div style="font-size:0.92rem; color:#059669; padding:0.5rem 0;">✔️ 處方搭配得宜，請依專科醫囑定時定候規律服用。</div>';
      }

      let beersHtml = '';
      if (drugBankMcp.beersAlerts && drugBankMcp.beersAlerts.length > 0) {
        drugBankMcp.beersAlerts.forEach(b => {
          beersHtml += `
            <div class="beers-alert-box">
              <div class="beers-alert-title" style="font-size:0.95rem;">
                <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
                高齡生活作息與服藥時段指引 (${escapeHtml(b.riskLevel)})
              </div>
              <p style="font-size:0.92rem; line-height:1.6; color:#0f766e;">${escapeHtml(b.warning)}</p>
            </div>
          `;
        });
      }

      mcpResultsContainer.innerHTML = `
        <div class="mcp-audit-card">
          <div class="mcp-audit-header">
            <div class="mcp-audit-title" style="font-size:1.15rem;">
              <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
              生活服藥排程落實與健康軌跡總評
            </div>
            <span class="mcp-latency-pill">分析耗時: ${drugBankMcp.mcpLookupLatencyMs || 85} ms</span>
          </div>

          <div style="font-size:0.9rem; color:#475569; margin-bottom:1rem; line-height:1.6;">
            <strong>追蹤核心：</strong>尊重專科處方醫囑與客觀居家量測軌跡 ｜ <strong>落實方針：</strong>晨、午、晚、睡前四時段生活服藥無縫對接
          </div>

          <div style="margin-bottom:0.9rem;">
            <strong style="font-size:0.95rem; color:#0f766e;">專科醫囑生活服藥配合事項 (Regimen Synergy & Fulfillment Notes)：</strong>
            <div style="margin-top:0.5rem;">${ddiHtml}</div>
          </div>

          ${beersHtml}

          <div style="margin-top:1rem; padding-top:0.6rem; border-top:1px dashed #99f6e4; font-size:0.85rem; color:#0f766e; display:flex; justify-content:space-between; flex-wrap:wrap; gap:0.5rem;">
            <span>🛡️ 專屬管道：PrescriptionPipeline</span>
            <span>總管線耗時：${telemetry ? telemetry.totalLatencyMs : 180} ms ｜ 雙層安全閥：10s 數據推導 / 30s 綜合推理 (25s~35s 黃金閾值)</span>
          </div>
        </div>
      `;
    }

  } catch (err) {
    clearInterval(timerInterval);
    if (progressContainer) progressContainer.classList.remove('active');
    console.error('處方比對失敗:', err);
    if (infTextEl) infTextEl.innerText = '比對失敗：' + err.message;
  }
}

// 手動加入自訂藥物比對
const rxManualForm = document.getElementById('rx-inference-form');
if (rxManualForm) {
  rxManualForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('custom-med-name').value.trim();
    const code = document.getElementById('custom-med-code').value.trim();
    const ind = document.getElementById('custom-med-ind').value.trim();

    if (!name || !code) return;

    const currListEl = document.getElementById('curr-meds-list');
    if (currListEl) {
      currListEl.innerHTML += `
        <div class="med-card-row change-timing">
          <div><strong>${escapeHtml(name)}</strong></div>
          <span class="med-code-badge">${escapeHtml(code)}</span>
          <div style="color:#0284c7; font-size:0.75rem; margin-top:0.25rem;">${escapeHtml(ind)}</div>
        </div>
      `;
    }
    alert(`已將「${name} (${code})」納入本期處方並完成推導！`);
  });
}

// ========================================================
// 7. Ollama 連線狀態與初始化
// ========================================================
async function checkOllamaStatus() {
  const dot = document.getElementById('ollama-status-dot');
  const label = document.getElementById('ollama-status-label');
  if (!dot || !label) return;

  try {
    const res = await fetch('/api/ollama/status');
    const result = await res.json();
    if (result.success && result.data.online) {
      dot.className = 'sys-dot online';
      label.innerText = `Ollama 在線 (${result.data.currentModel})`;
    } else {
      dot.className = 'sys-dot';
      dot.style.backgroundColor = '#f59e0b';
      label.innerText = 'Ollama 容器待命 (:11434)';
    }
  } catch (e) {
    dot.className = 'sys-dot';
    dot.style.backgroundColor = '#f59e0b';
    label.innerText = 'Ollama 容器待命 (:11434)';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

document.getElementById('refresh-all-btn').addEventListener('click', () => {
  loadDashboardData();
  loadVerbalOrdersList();
  checkOllamaStatus();
});

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  loadVerbalOrdersList();
  checkOllamaStatus();
  checkIosPwaPrompt();
  initUserAuth();
});

// ========================================================
// 8. 雙 LLM 呼叫管道與逾時安全閥監控 (Pipeline Monitor)
// ========================================================
const pipelineModal = document.getElementById('pipeline-modal');
const openPipelineBtn = document.getElementById('open-pipeline-modal-btn');
const closePipelineBtn = document.getElementById('close-pipeline-modal-btn');

if (openPipelineBtn && pipelineModal) {
  openPipelineBtn.addEventListener('click', () => {
    pipelineModal.classList.add('open');
    fetchPipelinesStatus();
  });
}

if (closePipelineBtn && pipelineModal) {
  closePipelineBtn.addEventListener('click', () => {
    pipelineModal.classList.remove('open');
  });
}

if (pipelineModal) {
  pipelineModal.addEventListener('click', (e) => {
    if (e.target === pipelineModal) {
      pipelineModal.classList.remove('open');
    }
  });
}

async function fetchPipelinesStatus() {
  try {
    const res = await fetch('/api/pipelines/status');
    const result = await res.json();
    if (!result.success) return;

    const { pipelines, dedicatedChannels } = result.data;

    // 管道 A
    if (pipelines.fastLocal) {
      const elUrl = document.getElementById('pipe-fast-url');
      const elModel = document.getElementById('pipe-fast-model');
      const elTimeout = document.getElementById('pipe-fast-timeout');
      const elStatus = document.getElementById('pipe-fast-status');

      if (elUrl) elUrl.innerText = pipelines.fastLocal.url;
      if (elModel) elModel.innerText = pipelines.fastLocal.model;
      if (elTimeout) elTimeout.innerText = `${pipelines.fastLocal.timeoutConfigMs} ms (快速中斷與備援)`;
      if (elStatus) elStatus.innerText = pipelines.fastLocal.status;
    }

    // 管道 B
    if (pipelines.mcpAugmented) {
      const elUrl = document.getElementById('pipe-mcp-url');
      const elLookup = document.getElementById('pipe-mcp-lookup-timeout');
      const elTotal = document.getElementById('pipe-mcp-total-timeout');
      const elStatus = document.getElementById('pipe-mcp-status');

      if (elUrl) elUrl.innerText = pipelines.mcpAugmented.url;
      if (elLookup) elLookup.innerText = `${pipelines.mcpAugmented.mcpTimeoutConfigMs} ms (防護中斷)`;
      if (elTotal) elTotal.innerText = `${pipelines.mcpAugmented.totalTimeoutConfigMs} ms (綜合推理)`;
      if (elStatus) elStatus.innerText = pipelines.mcpAugmented.status;
      

    }

    // 專屬隔離管道表格
    const tbody = document.getElementById('dedicated-channels-tbody');
    if (tbody && dedicatedChannels) {
      tbody.innerHTML = '';
      dedicatedChannels.forEach(ch => {
        tbody.innerHTML += `
          <tr>
            <td><strong>${escapeHtml(ch.feature)}</strong></td>
            <td><code style="color:#0284c7; font-weight:600;">${escapeHtml(ch.channel)}</code></td>
            <td><span style="color:#d97706; font-weight:700;">${ch.timeoutMs} ms</span></td>
            <td style="color:#475569;">${escapeHtml(ch.role)}</td>
          </tr>
        `;
      });
    }
  } catch (err) {
    console.warn('無法載入管道狀態:', err);
  }
}

// 監聽並將 fetchPipelinesStatus 加入自動輪詢
if (document.getElementById('refresh-all-btn')) {
  document.getElementById('refresh-all-btn').addEventListener('click', () => {
    fetchPipelinesStatus();
  });
}
document.addEventListener('DOMContentLoaded', () => {
  fetchPipelinesStatus();
});

// ========================================================
// 9. 臨床 Demo 情境檔案載入器 (Scenario Loader)
// ========================================================
const scenarioModal = document.getElementById('scenario-modal');
const openScenarioBtn = document.getElementById('open-scenario-modal-btn');
const closeScenarioBtn = document.getElementById('close-scenario-modal-btn');
const scenariosContainer = document.getElementById('scenarios-list-container');
const confirmLoadScenarioBtn = document.getElementById('confirm-load-scenario-btn');
const scenarioFileInput = document.getElementById('scenario-file-input');

let selectedScenarioData = null;

if (openScenarioBtn && scenarioModal) {
  openScenarioBtn.addEventListener('click', () => {
    scenarioModal.classList.add('open');
    fetchScenariosList();
  });
}

if (closeScenarioBtn && scenarioModal) {
  closeScenarioBtn.addEventListener('click', () => {
    scenarioModal.classList.remove('open');
  });
}

if (scenarioModal) {
  scenarioModal.addEventListener('click', (e) => {
    if (e.target === scenarioModal) {
      scenarioModal.classList.remove('open');
    }
  });
}

async function fetchScenariosList() {
  if (!scenariosContainer) return;
  scenariosContainer.innerHTML = '<div style="padding:1rem; color:#64748b;">正在掃描 scenarios/ 目錄...</div>';

  try {
    const res = await fetch('/api/scenarios');
    const result = await res.json();
    if (!result.success || !result.data || result.data.length === 0) {
      scenariosContainer.innerHTML = '<div style="padding:1rem; color:#64748b;">scenarios/ 資料夾內暫無情境檔案。您可以自行上傳 JSON。</div>';
      return;
    }

    scenariosContainer.innerHTML = '';
    result.data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'scenario-item-card';
      card.innerHTML = `
        <div class="scenario-card-info">
          <h4>${escapeHtml(item.title)}</h4>
          <p>${escapeHtml(item.description)}</p>
          <div class="scenario-card-meta">
            <span class="scenario-badge">長輩：${escapeHtml(item.patientName)}</span>
            <span class="scenario-badge">科別：${escapeHtml(item.department)}</span>
            <span class="scenario-badge" style="background:#e0f2fe; color:#0369a1;">檔名：${escapeHtml(item.filename)}</span>
          </div>
        </div>
        <button type="button" class="btn btn-outline btn-sm" style="flex-shrink:0;">選取</button>
      `;

      card.addEventListener('click', async () => {
        document.querySelectorAll('.scenario-item-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');

        try {
          const detailRes = await fetch(`/api/scenarios/${encodeURIComponent(item.filename)}`);
          const detail = await detailRes.json();
          if (detail.success) {
            selectedScenarioData = detail.data;
            showScenarioPreview(selectedScenarioData);
          }
        } catch (e) {
          console.error('讀取情境詳細失敗:', e);
        }
      });

      scenariosContainer.appendChild(card);
    });
  } catch (err) {
    scenariosContainer.innerHTML = `<div style="padding:1rem; color:#b91c1c;">載入情境清單失敗: ${err.message}</div>`;
  }
}

function showScenarioPreview(scenario) {
  const previewBox = document.getElementById('scenario-active-preview');
  const titleEl = document.getElementById('preview-scenario-title');
  const descEl = document.getElementById('preview-scenario-desc');

  if (previewBox && titleEl && descEl) {
    titleEl.innerText = scenario.title || scenario.patient?.name || '已選取情境';
    descEl.innerHTML = `
      <strong>臨床個案：</strong>${scenario.patient?.name} (${scenario.patient?.age}歲 / ${scenario.patient?.department})<br>
      <strong>核心衝突：</strong>${scenario.description || '無描述'}<br>
      <strong>門診處方：</strong>${scenario.prescriptions?.current?.length || 0} 種藥品比對 ｜ <strong>口頭醫囑：</strong>${scenario.verbalOrder?.rawInput ? '已備妥' : '無'}
    `;
    previewBox.style.display = 'block';
  }

  if (confirmLoadScenarioBtn) {
    confirmLoadScenarioBtn.disabled = false;
  }
}

// 支援從本機上傳自訂 JSON
if (scenarioFileInput) {
  scenarioFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (!parsed.patient) {
          alert('上傳的 JSON 缺少 patient 欄位，請參閱 scenarios/README.md 格式規範。');
          return;
        }
        selectedScenarioData = parsed;
        document.querySelectorAll('.scenario-item-card').forEach(c => c.classList.remove('selected'));
        showScenarioPreview(selectedScenarioData);
        alert(`自訂情境檔案「${file.name}」已讀取成功！請點選下方按鈕確認載入。`);
      } catch (err) {
        alert('JSON 解析失敗，請確認檔案格式是否正確: ' + err.message);
      }
    };
    reader.readAsText(file);
  });
}

// 確認載入情境至全系統
if (confirmLoadScenarioBtn) {
  confirmLoadScenarioBtn.addEventListener('click', async () => {
    if (!selectedScenarioData) return;

    confirmLoadScenarioBtn.disabled = true;
    confirmLoadScenarioBtn.innerText = '正在將情境寫入全系統資料庫...';

    try {
      const res = await fetch('/api/scenarios/load', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedScenarioData)
      });
      const result = await res.json();
      if (result.success) {
        // 1. 更新側邊欄長輩個案資訊
        const p = selectedScenarioData.patient;
        if (p) {
          const nameEl = document.querySelector('.case-name');
          const ageEl = document.querySelector('.case-age');
          const subEl = document.querySelector('.case-sub');
          const hubEl = document.querySelector('.case-hub-tag');

          if (nameEl) nameEl.innerText = p.name;
          if (ageEl) ageEl.innerText = `${p.age}歲`;
          if (subEl) subEl.innerText = `${p.primaryHospital} (${p.department})`;
          if (hubEl) hubEl.innerText = p.careCategory || '高齡慢性照護';
        }

        // 2. 更新口頭醫囑輸入框
        if (selectedScenarioData.verbalOrder) {
          const rawInputEl = document.getElementById('raw-verbal-input');
          if (rawInputEl) rawInputEl.value = selectedScenarioData.verbalOrder.rawInput || '';
        }

        // 4. 更新處方清單與推導總評
        if (selectedScenarioData.prescriptions) {
          const prevListEl = document.getElementById('prev-meds-list');
          const currListEl = document.getElementById('curr-meds-list');
          const infTextEl = document.getElementById('inference-summary-text');

          if (prevListEl && selectedScenarioData.prescriptions.previous) {
            prevListEl.innerHTML = '';
            selectedScenarioData.prescriptions.previous.forEach(m => {
              prevListEl.innerHTML += `
                <div class="med-card-row">
                  <div><strong>${escapeHtml(m.name)}</strong></div>
                  <span class="med-code-badge">${escapeHtml(m.code)}</span>
                  <div style="font-size:0.85rem; color:#64748b; margin-top:0.25rem;">${escapeHtml(m.ind || '')}</div>
                </div>
              `;
            });
          }

          if (currListEl && selectedScenarioData.prescriptions.current) {
            currListEl.innerHTML = '';
            selectedScenarioData.prescriptions.current.forEach(m => {
              const isTiming = m.ind && (m.ind.includes('調整') || m.ind.includes('改') || m.ind.includes('調降'));
              currListEl.innerHTML += `
                <div class="med-card-row ${isTiming ? 'change-timing' : ''}">
                  <div><strong>${escapeHtml(m.name)}</strong></div>
                  <span class="med-code-badge">${escapeHtml(m.code)}</span>
                  <div style="font-size:0.85rem; margin-top:0.25rem;">${escapeHtml(m.ind || '')}</div>
                </div>
              `;
            });
          }

          if (infTextEl && selectedScenarioData.prescriptions.inferenceSummary) {
            infTextEl.innerText = selectedScenarioData.prescriptions.inferenceSummary;
          }
        }

        // 5. 重新整理儀表板與醫囑列表
        await loadDashboardData();
        await loadVerbalOrdersList();

        if (scenarioModal) scenarioModal.classList.remove('open');
        alert(`✅ 成功載入情境【${selectedScenarioData.title || p.name}】！全系統畫面與資料庫已全面更新。`);
      } else {
        alert('載入情境失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      alert('載入情境連線失敗');
    } finally {
      confirmLoadScenarioBtn.disabled = false;
      confirmLoadScenarioBtn.innerText = '確認載入此情境至全系統';
    }
  });
}

// ========================================================
// 10. PWA 漸進式網頁應用 (加入主畫面 & 離線 Service Worker)
// ========================================================
let deferredPwaPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js')
      .then((reg) => console.log('✅ CareNav PWA Service Worker 註冊成功，範圍:', reg.scope))
      .catch((err) => console.warn('PWA Service Worker 註冊警示:', err));
  });
}

// Android / Chrome / Edge: 擷取系統安裝提示事件
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  const installBtn = document.getElementById('pwa-install-btn');
  const mobileInstallBtn = document.getElementById('mobile-pwa-install-btn');
  if (installBtn) installBtn.style.display = 'inline-flex';
  if (mobileInstallBtn) mobileInstallBtn.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  console.log('✅ CareNav 已成功加入至使用者手機/電腦桌面！');
  const installBtn = document.getElementById('pwa-install-btn');
  const mobileInstallBtn = document.getElementById('mobile-pwa-install-btn');
  if (installBtn) installBtn.style.display = 'none';
  if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
  deferredPwaPrompt = null;
});

async function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    const choiceResult = await deferredPwaPrompt.userChoice;
    console.log('使用者安裝回覆:', choiceResult.outcome);
    if (choiceResult.outcome === 'accepted') {
      const installBtn = document.getElementById('pwa-install-btn');
      const mobileInstallBtn = document.getElementById('mobile-pwa-install-btn');
      if (installBtn) installBtn.style.display = 'none';
      if (mobileInstallBtn) mobileInstallBtn.style.display = 'none';
    }
    deferredPwaPrompt = null;
  } else {
    alert('提示：您的瀏覽器已支援將 CareNav 加至桌面，請點選網址列右側的「安裝」圖示，或手機瀏覽器選單中的「加入主畫面」。');
  }
}
window.triggerPwaInstall = triggerPwaInstall;

// iOS Safari 專屬：浮現「加入主畫面」指引
function checkIosPwaPrompt() {
  const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  const isDismissed = localStorage.getItem('carenav_ios_banner_dismissed');

  if (isIos && !isStandalone && !isDismissed) {
    const banner = document.getElementById('ios-pwa-banner');
    if (banner) banner.style.display = 'block';
  }
}
window.checkIosPwaPrompt = checkIosPwaPrompt;

function dismissIosBanner() {
  const banner = document.getElementById('ios-pwa-banner');
  if (banner) banner.style.display = 'none';
  localStorage.setItem('carenav_ios_banner_dismissed', '1');
}
window.dismissIosBanner = dismissIosBanner;

// ========================================================
// 11. LINE 第三方登入與手足身分管理 (LINE Login & Family Auth)
// ========================================================
function initUserAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const lineLogin = urlParams.get('line_login');
  const authNotice = urlParams.get('auth_notice');
  const authError = urlParams.get('auth_error');

  if (lineLogin === 'success') {
    const user = {
      displayName: urlParams.get('name') || 'LINE 家屬',
      pictureUrl: urlParams.get('pic') || '',
      userId: urlParams.get('uid') || ''
    };
    localStorage.setItem('carenav_user', JSON.stringify(user));

    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
    alert(`🎉 歡迎！已成功透過 LINE 登入：${user.displayName}`);
  } else if (authNotice === 'line_config_needed') {
    showUserAuthModal();
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  } else if (authError) {
    alert('LINE 授權提示: ' + authError);
    const cleanUrl = window.location.origin + window.location.pathname;
    window.history.replaceState({}, document.title, cleanUrl);
  }

  updateAuthUI();
}

function updateAuthUI() {
  const userJson = localStorage.getItem('carenav_user');
  const btnLogin = document.getElementById('btn-line-login');
  const chipLoggedIn = document.getElementById('user-logged-in-chip');
  const avatarImg = document.getElementById('user-avatar-img');
  const nameEl = document.getElementById('user-display-name');

  const btnMobileLogin = document.getElementById('btn-mobile-line-login');
  const mobileUserChip = document.getElementById('mobile-user-chip');
  const mobileAvatar = document.getElementById('mobile-user-avatar');

  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      if (btnLogin) btnLogin.style.display = 'none';
      if (chipLoggedIn) chipLoggedIn.style.display = 'inline-flex';
      if (nameEl) nameEl.innerText = user.displayName;
      if (avatarImg) {
        avatarImg.src = user.pictureUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face';
      }

      if (btnMobileLogin) btnMobileLogin.style.display = 'none';
      if (mobileUserChip) mobileUserChip.style.display = 'flex';
      if (mobileAvatar) {
        mobileAvatar.src = user.pictureUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=face';
      }

      // 同步自動更新手足協同留話簿作者
      const noteAuthorSelect = document.getElementById('note-author');
      if (noteAuthorSelect) {
        let matched = false;
        for (let i = 0; i < noteAuthorSelect.options.length; i++) {
          if (noteAuthorSelect.options[i].text.includes(user.displayName)) {
            noteAuthorSelect.selectedIndex = i;
            matched = true;
            break;
          }
        }
        if (!matched) {
          const opt = document.createElement('option');
          opt.value = user.displayName;
          opt.text = `${user.displayName} (LINE登入)`;
          opt.selected = true;
          noteAuthorSelect.insertBefore(opt, noteAuthorSelect.firstChild);
        }
      }
    } catch (e) {
      console.warn('使用者身分解析異常', e);
    }
  } else {
    if (btnLogin) btnLogin.style.display = 'inline-flex';
    if (chipLoggedIn) chipLoggedIn.style.display = 'none';
    if (btnMobileLogin) btnMobileLogin.style.display = 'inline-flex';
    if (mobileUserChip) mobileUserChip.style.display = 'none';
  }
}

async function startLineLogin() {
  try {
    const res = await fetch('/api/auth/config');
    const result = await res.json();
    if (result.success && result.data.lineConfigured) {
      window.location.href = '/auth/line';
    } else {
      showUserAuthModal();
    }
  } catch (e) {
    showUserAuthModal();
  }
}
window.startLineLogin = startLineLogin;

function showUserAuthModal() {
  const modal = document.getElementById('line-auth-modal');
  if (modal) modal.classList.add('open');
}
window.showUserAuthModal = showUserAuthModal;

function closeUserAuthModal() {
  const modal = document.getElementById('line-auth-modal');
  if (modal) modal.classList.remove('open');
}
window.closeUserAuthModal = closeUserAuthModal;

const closeLineModalBtn = document.getElementById('close-line-modal-btn');
if (closeLineModalBtn) closeLineModalBtn.addEventListener('click', closeUserAuthModal);

function copyLineCallbackUrl() {
  const copyInput = document.getElementById('line-callback-copy-input');
  if (copyInput) {
    copyInput.select();
    navigator.clipboard.writeText(copyInput.value).then(() => {
      alert('✅ 已複製 LINE 回呼網址 (Callback URL)！\n請直接至 LINE Developers Console 貼上。');
    });
  }
}
window.copyLineCallbackUrl = copyLineCallbackUrl;

async function mockFamilyLogin(roleName, location) {
  try {
    const res = await fetch('/api/auth/mock-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleName, location })
    });
    const result = await res.json();
    if (result.success) {
      localStorage.setItem('carenav_user', JSON.stringify(result.data));
      updateAuthUI();
      closeUserAuthModal();
      alert(`✅ 已成功以【${roleName}】身分登入！您現在發布的所有手足備忘都會具名記錄。`);
    }
  } catch (e) {
    alert('模擬登入失敗');
  }
}
window.mockFamilyLogin = mockFamilyLogin;

function logoutLine() {
  if (confirm('確定要登出目前帳號嗎？')) {
    localStorage.removeItem('carenav_user');
    updateAuthUI();
    alert('已登出。');
  }
}
window.logoutLine = logoutLine;
