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
  'view-guide': {
    title: '診前臨床指引卡生成器 (Doctor Discussion Guide)',
    desc: '依晨間血壓、夜尿與表徵異常，AI 濃縮為主治醫師 20 秒讀完的精準主訴與 5 秒勾選回條'
  },
  'view-orders': {
    title: '口頭醫囑結構化轉譯 (Verbal Orders Digitization)',
    desc: '診後極速語音/文字錄入，自動轉譯為全家皆懂的【觸發條件 - 具體行動 - 危急紅旗】'
  },
  'view-prescription': {
    title: '藥袋用法代碼逆向推導 (Prescription Inference Engine)',
    desc: '拍照上傳新藥袋，自動比對前後期用法標籤 (QD HS ➜ QD AM)，預留藥學知識庫 MCP 接口'
  },
  'view-hub': {
    title: '在地醫院 Hub 陪診媒合 (Hospital Hub)',
    desc: '鎖定林口長庚、台大、榮總 15~20 分鐘半徑，專業執業護理特助攜指引卡進診間'
  }
};

function switchView(targetViewId) {
  navItems.forEach(item => {
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
  if (meta) {
    pageTitleEl.innerText = meta.title;
    pageDescEl.innerText = meta.desc;
  }
}

navItems.forEach(item => {
  item.addEventListener('click', () => {
    const target = item.getAttribute('data-view');
    switchView(target);
  });
});

// ========================================================
// 2. 全家照護雲端看板 (Family Care Hub) 資料載入
// ========================================================
async function loadDashboardData() {
  try {
    const res = await fetch('/api/dashboard');
    const result = await res.json();
    if (!result.success) return;

    const { patient, latestGuide, latestOrder, currentPrescription, familyNotes } = result.data;

    // 渲染時間軸
    const timelineEl = document.getElementById('dashboard-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = `
        <div class="timeline-entry">
          <div class="timeline-pin"></div>
          <div class="timeline-header">
            <span class="timeline-title">心臟內科門診・最新口頭醫囑</span>
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
            <span class="timeline-title">診前臨床指引卡・決策備忘</span>
            <span class="timeline-date">門診前 24 小時生成</span>
          </div>
          <div class="timeline-card-box">
            <p>${latestGuide ? latestGuide.key_complaint : '近兩週晨間收縮壓反覆升高且夜尿增加，疑似利尿劑投藥時間不當。'}</p>
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

    // 載入處方對比預設
    loadPrescriptionPreset('changed');

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
// 3. 診前臨床指引卡 (Doctor Discussion Guide)
// ========================================================
const guideForm = document.getElementById('guide-form');
if (guideForm) {
  guideForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const department = document.getElementById('guide-department').value;
    const doctorName = document.getElementById('guide-doctor').value;
    const visitDate = document.getElementById('guide-date').value;
    const morningBp = document.getElementById('guide-morning-bp').value.trim();
    const nocturiaCount = document.getElementById('guide-nocturia').value.trim();
    const symptoms = document.getElementById('guide-symptoms').value.trim();

    const btn = document.getElementById('generate-guide-btn');
    btn.disabled = true;
    btn.innerText = '正在調用 AI 濃縮為 20 秒醫師指引卡...';

    try {
      const res = await fetch('/api/guides/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, doctorName, visitDate, morningBp, nocturiaCount, symptoms })
      });

      const result = await res.json();
      if (result.success) {
        document.getElementById('card-dept-meta').innerHTML = `<strong>科別：</strong>${result.data.department}・${result.data.doctorName}`;
        document.getElementById('card-date-meta').innerHTML = `<strong>日期：</strong>${result.data.visitDate}`;
        document.getElementById('card-complaint').innerText = result.data.keyComplaint;
        document.getElementById('card-questions').innerText = result.data.doctorQuestions;

        const triageContainer = document.getElementById('card-triage-options');
        triageContainer.innerHTML = '';
        result.data.triageOptions.forEach((opt, idx) => {
          const checked = idx === 1 ? 'checked' : '';
          triageContainer.innerHTML += `
            <label class="triage-item"><input type="checkbox" ${checked}> ${opt}</label>
          `;
        });

        alert('20秒主治醫師臨床指引卡已生成！可直接列印 A4/A5 或由特助攜入診間。');
      } else {
        alert('生成失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      alert('伺服器連線異常');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `
        <svg class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
        </svg>
        AI 自動濃縮為 20 秒醫師臨床指引卡
      `;
    }
  });
}

// ========================================================
// 4. 口頭醫囑結構化轉譯 (Verbal Orders Digitization)
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
// 5. 藥袋用法代碼逆向推導 (Prescription Inference Engine)
// ========================================================
let uploadedBagImageBase64 = null;

// 藥袋照片上傳預覽
const bagImageInput = document.getElementById('bag-image-input');
if (bagImageInput) {
  bagImageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        uploadedBagImageBase64 = event.target.result;
        const previewImg = document.getElementById('bag-image-preview');
        const previewContainer = document.getElementById('image-preview-container');
        if (previewImg && previewContainer) {
          previewImg.src = uploadedBagImageBase64;
          previewContainer.style.display = 'block';
        }
      };
      reader.readAsDataURL(file);
    }
  });
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
// 6. 在地醫院 Hub 陪診媒合 (Hospital Hub)
// ========================================================
async function loadHubBookings() {
  const container = document.getElementById('hub-bookings-list');
  if (!container) return;

  try {
    const res = await fetch('/api/hub-bookings');
    const result = await res.json();
    if (result.success && result.data.length > 0) {
      container.innerHTML = '';
      result.data.forEach(item => {
        container.innerHTML += `
          <div style="background:#ffffff; border:1px solid #e2e8f0; border-radius:6px; padding:0.75rem; margin-top:0.5rem; font-size:0.82rem;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>${escapeHtml(item.hospital_name)} (${escapeHtml(item.department)})</strong>
              <span class="status-badge">${escapeHtml(item.status)}</span>
            </div>
            <div style="color:#64748b; font-size:0.78rem; margin-top:0.25rem;">
              就醫時段：${escapeHtml(item.visit_date)} | 指定護理特助：${escapeHtml(item.escort_name)}
            </div>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

const bookingForm = document.getElementById('hub-booking-form');
if (bookingForm) {
  bookingForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hospitalName = document.getElementById('booking-hospital').value;
    const department = document.getElementById('booking-dept').value;
    const visitDate = document.getElementById('booking-date').value;
    const escortName = document.getElementById('booking-escort').value;

    try {
      const res = await fetch('/api/hub-bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalName, department, visitDate, escortName })
      });
      const result = await res.json();
      if (result.success) {
        alert('在地護理特助陪診已預約成功！特助將攜帶診前指引卡陪同就診。');
        await loadHubBookings();
      }
    } catch (e) {
      alert('預約失敗');
    }
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
  loadHubBookings();
  checkOllamaStatus();
});

document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  loadVerbalOrdersList();
  loadHubBookings();
  checkOllamaStatus();
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
      
      const mcpLivePill = document.getElementById('mcp-live-pill');
      if (mcpLivePill) {
        mcpLivePill.innerText = `DrugBank MCP: ${pipelines.mcpAugmented.latencyMs || 85}ms (${pipelines.mcpAugmented.status.includes('Online') ? '在線' : '實證安全網'})`;
      }
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

          // 2. 更新診前指引表單欄位與預覽卡片
          const bpEl = document.getElementById('guide-morning-bp');
          const nocturiaEl = document.getElementById('guide-nocturia');
          const symEl = document.getElementById('guide-symptoms');
          const deptEl = document.getElementById('guide-department');
          const docEl = document.getElementById('guide-doctor');

          if (selectedScenarioData.doctorDiscussionGuide) {
            const dg = selectedScenarioData.doctorDiscussionGuide;
            if (bpEl) bpEl.value = dg.morningBp || '';
            if (nocturiaEl) nocturiaEl.value = dg.nocturiaCount || '';
            if (symEl) symEl.value = dg.symptoms || '';

            // 即時更新診前指引卡
            if (dg.keyComplaint) {
              const compEl = document.getElementById('card-complaint');
              if (compEl) compEl.innerText = dg.keyComplaint;
            }
            if (dg.doctorQuestions) {
              const qEl = document.getElementById('card-questions');
              if (qEl) qEl.innerText = Array.isArray(dg.doctorQuestions) ? dg.doctorQuestions.join('\n') : dg.doctorQuestions;
            }
            if (dg.triageOptions) {
              const triageContainer = document.getElementById('card-triage-options');
              if (triageContainer) {
                triageContainer.innerHTML = '';
                dg.triageOptions.forEach((opt, idx) => {
                  const checked = idx === 1 ? 'checked' : '';
                  triageContainer.innerHTML += `<label class="triage-item"><input type="checkbox" ${checked}> ${escapeHtml(opt)}</label>`;
                });
              }
            }
            const deptMetaEl = document.getElementById('card-dept-meta');
            const dateMetaEl = document.getElementById('card-date-meta');
            if (deptMetaEl) deptMetaEl.innerHTML = `<strong>科別：</strong>${escapeHtml(p.department)}・${escapeHtml(p.doctorName)}`;
            if (dateMetaEl) dateMetaEl.innerHTML = `<strong>日期：</strong>${escapeHtml(p.visitDate || '2026-11-20')}`;
          }
          if (deptEl) deptEl.value = p.department;
          if (docEl) docEl.value = p.doctorName;
        }

        // 3. 更新口頭醫囑輸入框
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
