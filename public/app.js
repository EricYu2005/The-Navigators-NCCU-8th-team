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

function loadPrescriptionPreset(type) {
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

  if (currListEl) {
    currListEl.innerHTML = `
      <div class="med-card-row change-timing">
        <div><strong style="color:#0f766e;">Norvasc 脈優錠 5mg</strong></div>
        <span class="med-code-badge" style="background:#ccfbf1; color:#0f766e;">QD AM (改早晨)</span>
        <div style="color:#0f766e; font-size:0.75rem; margin-top:0.25rem;">時段變更：壓制晨峰高血壓 (早晨7-9點)</div>
      </div>
      <div class="med-card-row change-timing">
        <div><strong style="color:#0f766e;">Lasix 歐得通/利尿劑 40mg</strong></div>
        <span class="med-code-badge" style="background:#ccfbf1; color:#0f766e;">QD AM (改早晨)</span>
        <div style="color:#0f766e; font-size:0.75rem; margin-top:0.25rem;">時段變更：改早餐後吃，夜尿降為 1 次防跌</div>
      </div>
      <div class="med-card-row change-new">
        <div><strong style="color:#4338ca;">Diovan 得安穩 80mg</strong></div>
        <span class="med-code-badge" style="background:#e0e7ff; color:#4338ca;">QD HS (新開立)</span>
        <div style="color:#4338ca; font-size:0.75rem; margin-top:0.25rem;">本期新增：保護慢性腎臟病第3期之腎小球功能</div>
      </div>
      <div class="med-card-row">
        <div><strong>Crestor 冠脂妥 10mg</strong></div>
        <span class="med-code-badge">QD HS (維持睡前)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.25rem;">維持原方續開</div>
      </div>
    `;
  }

  if (infTextEl) {
    infTextEl.innerText = '【門診處方逆向推導診斷】本期門診將利尿劑與脈優由夜間睡前 (QD HS) 成功調整至晨間 (QD AM)，徹底化解長輩夜間起夜 3-4 次之跌倒高風險；加開得安穩保護慢性腎臟病第3期。';
  }

  triggerMcpSimulation();
}

function triggerMcpSimulation() {
  const mcpArea = document.getElementById('mcp-notes-area');
  if (!mcpArea) return;

  mcpArea.innerHTML = `
    <div style="margin-top:0.75rem; padding:0.75rem; background:#f5f3ff; border:1px solid #c7d2fe; border-radius:6px; font-size:0.8rem; color:#3730a3;">
      <div style="font-weight:700; margin-bottom:0.25rem;">藥學知識庫 MCP 即時臨床審查反饋：</div>
      <ul style="margin-left:1.25rem; line-height:1.6;">
        <li><strong>DDI 交互作用警示：</strong>Norvasc (CCB) 與 Diovan (ARB) 協同降壓，服藥時段調整首週，晨間由平躺坐起需防範姿勢性低血壓。</li>
        <li><strong>Beers Criteria 老人用藥準則：</strong>將 Loop 利尿劑由睡前調整至早晨符合高齡最佳給藥指引，顯著降低起夜骨折事件率。</li>
      </ul>
    </div>
  `;
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
