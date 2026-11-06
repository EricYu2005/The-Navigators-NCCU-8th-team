/**
 * app.js
 * CareNav 智護領航 - 前端交互控制器
 * 包含：
 * 1. 左側面板視圖分頁切換 (Multi-view Tab Switching)
 * 2. 全家照護雲端看板即時資料同步 (Dashboard Data Fetching)
 * 3. 診前臨床指引卡生成 (Doctor Discussion Guide Generation)
 * 4. 口頭醫囑轉譯與語音模擬 (Verbal Orders Parser)
 * 5. 藥袋代碼逆向推導與【藥學知識庫 MCP】模擬 (Prescription Inference Engine)
 * 6. 在地醫院 Hub 陪診派案 (Hospital Hub Booking)
 */

// ========================================================
// 1. 左側面板導覽與視圖切換機制 (View Switcher)
// ========================================================
const navItems = document.querySelectorAll('.nav-item');
const pageViews = document.querySelectorAll('.page-view');
const pageTitleEl = document.getElementById('page-title');
const pageDescEl = document.getElementById('page-desc');

const VIEW_METAS = {
  'view-dashboard': {
    title: '全家照護看板 (Family Care Hub)',
    desc: '手足同步瀏覽跨科就醫履歷、最新處方異動與口頭醫囑，杜絕照護內耗'
  },
  'view-guide': {
    title: '診前臨床指引卡生成器 (Doctor Discussion Guide)',
    desc: '將兩週碎狀生理數值與主訴濃縮為主治醫師 20 秒快讀指引卡，自帶 5 秒勾選回條'
  },
  'view-orders': {
    title: '口頭醫囑結構化轉譯 (Verbal Orders Digitization)',
    desc: '出診間極速錄音/勾選，自動轉譯為全家皆懂的【觸發條件 - 具體行動 - 紅旗警訊】'
  },
  'view-prescription': {
    title: '藥袋用法代碼逆向推導 (Prescription Inference Engine)',
    desc: '拍照解析醫學代碼 (QD AM/HS)，自動比對新舊處方時段變更，預留藥學知識庫 MCP 接口'
  },
  'view-hub': {
    title: '在地醫院 Hub 陪診媒合 (Hospital Hub)',
    desc: '鎖定林口長庚、台大、榮總 15~20 分鐘生活圈，資深護理特助帶指引卡進診間'
  }
};

function switchView(targetViewId) {
  // 切換選單按鈕高亮
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === targetViewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // 切換頁面視圖
  pageViews.forEach(view => {
    if (view.id === targetViewId) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // 更新頂部標題與說明
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

    const { patient, latestGuide, latestOrder, currentPrescription, nextBooking } = result.data;

    // 渲染時間軸
    const timelineEl = document.getElementById('dashboard-timeline');
    if (timelineEl) {
      timelineEl.innerHTML = `
        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-header">
            <span class="timeline-title">🩺 心臟內科回診・門診醫囑</span>
            <span class="timeline-time">${latestOrder ? latestOrder.created_at.slice(0, 10) : '2026-11-05'}</span>
          </div>
          <div class="timeline-body">
            <strong>${latestOrder ? latestOrder.condition_text : '晨間血壓 < 110 mmHg 時'}：</strong>
            <p>${latestOrder ? latestOrder.action_text : '暫停當天早晨脈優 5mg 一次。'}</p>
            <small style="color:#0284c7;">由：${latestOrder ? latestOrder.recorded_by : '特助紀錄'}</small>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-header">
            <span class="timeline-title">📋 診前臨床指引卡備忘</span>
            <span class="timeline-time">看診前 24 小時</span>
          </div>
          <div class="timeline-body">
            <p>${latestGuide ? latestGuide.key_complaint : '近兩週血壓晨間波動升高且夜尿增加。'}</p>
          </div>
        </div>

        <div class="timeline-item">
          <div class="timeline-dot"></div>
          <div class="timeline-header">
            <span class="timeline-title">💊 藥袋處方時段優化</span>
            <span class="timeline-time">本期門診領藥</span>
          </div>
          <div class="timeline-body">
            <p>已將利尿劑與脈優改至早晨服用 (QD AM)，防範夜尿跌倒風險。</p>
          </div>
        </div>
      `;
    }

    // 渲染今日四時段用藥排程
    const scheduleEl = document.getElementById('dashboard-schedule');
    if (scheduleEl && currentPrescription) {
      scheduleEl.innerHTML = `
        <div class="slot-box">
          <div class="slot-header">🌅 早晨 (AM) 飯後</div>
          <div class="slot-med-list">
            <span class="slot-med-tag">Norvasc 脈優 5mg (1顆)</span>
            <span class="slot-med-tag">Lasix 歐得通/利尿劑 40mg (1顆)</span>
          </div>
        </div>
        <div class="slot-box">
          <div class="slot-header">☀️ 中午 (Noon)</div>
          <div class="slot-med-list">
            <span style="color:#94a3b8; font-size:0.75rem;">無中午常規用藥</span>
          </div>
        </div>
        <div class="slot-box">
          <div class="slot-header">🌇 傍晚 (PM) 飯後</div>
          <div class="slot-med-list">
            <span style="color:#94a3b8; font-size:0.75rem;">無晚餐常規用藥</span>
          </div>
        </div>
        <div class="slot-box">
          <div class="slot-header">🌙 睡前 (HS)</div>
          <div class="slot-med-list">
            <span class="slot-med-tag">Diovan 得安穩 80mg (1顆)</span>
            <span class="slot-med-tag">Crestor 冠脂妥 10mg (1顆)</span>
          </div>
        </div>
      `;
    }

    // 載入前期與本期處方對照
    loadPrescriptionPreset('changed');

  } catch (err) {
    console.error('載入看板失敗:', err);
  }
}

// ========================================================
// 3. 診前臨床指引卡 (Doctor Discussion Guide) 生成
// ========================================================
const guideForm = document.getElementById('guide-form');
if (guideForm) {
  guideForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const department = document.getElementById('guide-department').value;
    const doctorName = document.getElementById('guide-doctor').value;
    const vitalsSummary = document.getElementById('guide-vitals').value;
    const symptoms = document.getElementById('guide-symptoms').value;

    const btn = document.getElementById('generate-guide-btn');
    btn.disabled = true;
    btn.innerText = '🤖 正在濃縮主訴為 20 秒快讀指引...';

    try {
      const res = await fetch('/api/guides/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department, doctorName, vitalsSummary, symptoms })
      });

      const result = await res.json();
      if (result.success) {
        // 更新右側指引卡預覽
        document.getElementById('card-dept-meta').innerText = `科別：${result.data.department}`;
        document.getElementById('card-complaint').innerText = result.data.keyComplaint;
        document.getElementById('card-questions').innerText = result.data.doctorQuestions;

        const triageContainer = document.getElementById('card-triage-options');
        triageContainer.innerHTML = '';
        result.data.triageOptions.forEach((opt, idx) => {
          const checked = idx === 1 ? 'checked' : '';
          triageContainer.innerHTML += `
            <label class="triage-checkbox"><input type="checkbox" ${checked}> ${opt}</label>
          `;
        });

        alert('✅ 20秒臨床指引卡已生成！可點擊右上角列印或直接展示給醫師！');
      } else {
        alert('生成失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      alert('伺服器連線異常');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ AI 自動濃縮為 20 秒醫師指引卡</span>';
    }
  });
}

// ========================================================
// 4. 口頭醫囑結構化轉譯 (Verbal Orders Digitization)
// ========================================================
const verbalForm = document.getElementById('verbal-order-form');
const rawInputEl = document.getElementById('raw-verbal-input');

function loadSampleVoice(sampleId) {
  if (sampleId === 1) {
    rawInputEl.value = '如果早上量血壓收縮壓低於 110，那顆脈優 5mg 先停吃一次。其餘常規藥照常吃。';
  } else if (sampleId === 2) {
    rawInputEl.value = '利尿劑改去早上吃免得一直起來夜尿，但如果下肢水腫三天沒消要提早回來加驗腎功能。';
  } else if (sampleId === 3) {
    rawInputEl.value = '如果血糖低於 70 出現手抖心悸，趕快喝 150cc 果汁或吃三顆方糖，暫停下次短效降糖藥。';
  }
}

if (verbalForm) {
  verbalForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawInput = rawInputEl.value.trim();
    const recordedBy = document.getElementById('order-recorder').value;
    const department = document.getElementById('order-dept').value;

    if (!rawInput) {
      alert('請輸入或選擇醫師口頭醫囑範本！');
      return;
    }

    const btn = document.getElementById('parse-order-btn');
    btn.disabled = true;
    btn.innerText = '⚙️ 結構化轉譯中...';

    try {
      const res = await fetch('/api/verbal-orders/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawInput, recordedBy, department })
      });

      const result = await res.json();
      if (result.success) {
        await loadVerbalOrdersList();
        alert('🎉 口頭醫囑轉譯成功！已同步發布至全家照護看板！');
        rawInputEl.value = '';
      } else {
        alert('轉譯失敗: ' + result.message);
      }
    } catch (err) {
      console.error(err);
      alert('轉譯失敗');
    } finally {
      btn.disabled = false;
      btn.innerHTML = '<span>⚡ 結構化轉譯為白話行動指引 ➜ 推播全家</span>';
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
          <div class="order-card-item">
            <div class="order-item-header">
              <strong style="color:#0f172a;">${order.department || '門診醫囑'}・${order.doctor_name || '主治醫師'}</strong>
              <span class="badge badge-indigo">${order.created_at.slice(0, 16)}</span>
            </div>
            <div class="order-raw">口語原始交代：「${order.raw_input}」</div>
            <div class="rule-block rule-condition">
              <strong>${order.condition_text || '觸發條件'}</strong>
            </div>
            <div class="rule-block rule-action">
              <strong>${order.action_text || '行動處置'}</strong>
            </div>
            <div class="rule-block rule-redflags">
              <strong>${order.red_flags || '危急紅旗'}</strong>
            </div>
            <div style="font-size:0.75rem; color:#64748b; margin-top:0.5rem; text-align:right;">
              由 <strong>${order.recorded_by}</strong> 於診後即時收錄
            </div>
          </div>
        `;
      });
    }
  } catch (e) {
    console.error(e);
  }
}

// 語音按鈕模擬
const voiceBtn = document.getElementById('voice-record-btn');
if (voiceBtn) {
  let isRecording = false;
  voiceBtn.addEventListener('click', () => {
    isRecording = !isRecording;
    if (isRecording) {
      voiceBtn.style.background = '#ef4444';
      voiceBtn.innerHTML = '<span class="mic-icon">🔴</span> 正在聆聽診間交代...（再次點擊結束）';
    } else {
      voiceBtn.style.background = 'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)';
      voiceBtn.innerHTML = '<span class="mic-icon">🎤</span> 按住錄音（或點擊下方快捷範本）';
      loadSampleVoice(1);
    }
  });
}

// ========================================================
// 5. 藥袋逆向推導引擎 (Prescription Inference Engine)
// ========================================================
function loadPrescriptionPreset(type) {
  const prevListEl = document.getElementById('prev-meds-list');
  const currListEl = document.getElementById('curr-meds-list');
  const infTextEl = document.getElementById('inference-summary-text');

  if (prevListEl) {
    prevListEl.innerHTML = `
      <div class="med-row">
        <div class="med-name">Norvasc 脈優錠 5mg</div>
        <span class="med-code-pill">QD HS (睡前服)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.2rem;">高血壓</div>
      </div>
      <div class="med-row highlight-change">
        <div class="med-name">Lasix 歐得通/利尿劑 40mg</div>
        <span class="med-code-pill" style="background:#fee2e2; color:#dc2626;">QD HS (睡前服) ⚠️</span>
        <div style="color:#b91c1c; font-size:0.75rem; margin-top:0.2rem;">導致嚴重夜尿與起夜跌倒風險</div>
      </div>
      <div class="med-row">
        <div class="med-name">Crestor 冠脂妥 10mg</div>
        <span class="med-code-pill">QD HS (睡前服)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.2rem;">高血脂</div>
      </div>
    `;
  }

  if (currListEl) {
    currListEl.innerHTML = `
      <div class="med-row highlight-change">
        <div class="med-name">Norvasc 脈優錠 5mg</div>
        <span class="med-code-pill" style="background:#dcfce7; color:#166534;">QD AM (改早晨) ✨</span>
        <div style="color:#15803d; font-size:0.75rem; margin-top:0.2rem;">時段變更：壓制清晨高血壓峰值</div>
      </div>
      <div class="med-row highlight-change">
        <div class="med-name">Lasix 歐得通/利尿劑 40mg</div>
        <span class="med-code-pill" style="background:#dcfce7; color:#166534;">QD AM (改早晨) ✨</span>
        <div style="color:#15803d; font-size:0.75rem; margin-top:0.2rem;">時段變更：改早餐後吃，夜尿降為1次</div>
      </div>
      <div class="med-row highlight-change">
        <div class="med-name">Diovan 得安穩 80mg</div>
        <span class="med-code-pill" style="background:#e0e7ff; color:#4338ca;">QD HS (新開立) 🆕</span>
        <div style="color:#4338ca; font-size:0.75rem; margin-top:0.2rem;">本期新增：保護心臟與腎臟功能</div>
      </div>
      <div class="med-row">
        <div class="med-name">Crestor 冠脂妥 10mg</div>
        <span class="med-code-pill">QD HS (睡前服)</span>
        <div style="color:#64748b; font-size:0.75rem; margin-top:0.2rem;">維持不變</div>
      </div>
    `;
  }

  if (infTextEl) {
    infTextEl.innerText = '【逆向推導完成】本期門診將利尿劑與脈優從睡前 (HS) 調整至晨間 (AM)，徹底消除長輩半夜起夜頻繁跌倒之隱患；新增得安穩保護慢性腎臟病第3期。';
  }

  triggerMcpSimulation();
}

function triggerMcpSimulation() {
  const mcpArea = document.getElementById('mcp-notes-area');
  if (!mcpArea) return;

  mcpArea.innerHTML = `
    <div style="margin-top:0.75rem; padding:0.65rem; background:rgba(79, 70, 229, 0.08); border-radius:6px; border-left:3px solid #4f46e5; font-size:0.8rem; color:#3730a3;">
      <strong>🔌 [藥學知識庫 MCP 即時比對警示]：</strong>
      <ul style="margin-left:1.2rem; margin-top:0.25rem;">
        <li>Norvasc (CCB) + Diovan (ARB) 協同降壓，首週晨間起立時需注意「姿勢性低血壓」。</li>
        <li>Beers Criteria 高齡用藥指引：利尿劑避開夜間服用判定為「高度適當之劑量排程優化」。</li>
      </ul>
    </div>
  `;
}

// 支援手動新增自訂藥物
const rxForm = document.getElementById('rx-inference-form');
if (rxForm) {
  rxForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('custom-med-name').value;
    const code = document.getElementById('custom-med-code').value;
    const ind = document.getElementById('custom-med-ind').value;

    const currListEl = document.getElementById('curr-meds-list');
    currListEl.innerHTML += `
      <div class="med-row highlight-change">
        <div class="med-name">${name}</div>
        <span class="med-code-pill">${code}</span>
        <div style="color:#0284c7; font-size:0.75rem; margin-top:0.2rem;">${ind}</div>
      </div>
    `;
    alert(`✅ 已將「${name}」以代碼【${code}】加入本期處方並完成推導！`);
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
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:0.75rem; margin-top:0.5rem; font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between;">
              <strong>🏥 ${item.hospital_name} (${item.department})</strong>
              <span class="badge badge-success">${item.status}</span>
            </div>
            <div style="color:#64748b; font-size:0.8rem; margin-top:0.25rem;">
              📅 預定時間：${item.visit_date} | 👩‍⚕️ 指派特助：${item.escort_name}
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
        alert('🎉 恭喜！陪診特助已預約成功！特助將攜帶診前指引卡陪同就診。');
        await loadHubBookings();
      }
    } catch (e) {
      alert('預約失敗');
    }
  });
}

// 刷新按鈕
document.getElementById('refresh-all-btn').addEventListener('click', () => {
  loadDashboardData();
  loadVerbalOrdersList();
  loadHubBookings();
});

// 頁面初始化
document.addEventListener('DOMContentLoaded', () => {
  loadDashboardData();
  loadVerbalOrdersList();
  loadHubBookings();
});
