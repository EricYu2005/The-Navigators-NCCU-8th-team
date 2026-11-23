/**
 * server.js
 * 好選保健 PurePick - 跨品牌保健食品比較、去冗評估與服用日曆管理平台
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbQuery, clearUserPersonalData, restoreDemoData } = require('./database');
const { evaluateFinderSolution, evaluateWishlistPortfolio } = require('./supplementEngine');
const { isVertexAiConfigured, analyzeSupplementImage } = require('./vertexAiService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
    }
  }
}));

function normalizeLineUserId(raw) {
  return String(raw || '').trim();
}

/**
 * 輔助函式：取得指定使用者的「有興趣清單 (wishlist)」與「已購買清單 (purchased)」完整商品資料
 * - lineUserId 有值：僅讀取該 LINE 實名使用者的個人資料，絕不混入官方示範帳號
 * - lineUserId 為空：讀取未登入的官方示範資料
 */
async function getUserLists(lineUserId = '') {
  const uid = normalizeLineUserId(lineUserId);
  const whereClause = uid
    ? 'WHERE us.line_user_id = ?'
    : "WHERE (us.line_user_id IS NULL OR us.line_user_id = '')";
  const params = uid ? [uid] : [];

  const rows = await dbQuery.all(`
    SELECT
      us.id as record_id,
      us.supplement_id,
      us.status,
      us.intake_time,
      us.started_date,
      us.remaining_days,
      us.user_name,
      us.line_user_id,
      s.*
    FROM user_supplements us
    JOIN supplements s ON us.supplement_id = s.id
    ${whereClause}
    ORDER BY us.id DESC
  `, params);

  const wishlist = [];
  const purchased = [];
  const seenW = new Set();
  const seenP = new Set();

  for (const r of rows) {
    let nutrients = {};
    try { nutrients = JSON.parse(r.nutrients_json || '{}'); } catch (e) {}
    const item = { ...r, id: r.supplement_id, nutrients };

    if (r.status === 'wishlist' && !seenW.has(r.supplement_id)) {
      seenW.add(r.supplement_id);
      wishlist.push(item);
    } else if (r.status === 'purchased' && !seenP.has(r.supplement_id)) {
      seenP.add(r.supplement_id);
      purchased.push(item);
    }
  }

  return { wishlist, purchased };
}

async function getUserCalendarLogs(lineUserId = '') {
  const uid = normalizeLineUserId(lineUserId);
  const rawLogs = await dbQuery.all(
    'SELECT * FROM user_calendar_logs WHERE line_user_id = ? ORDER BY date_str ASC',
    [uid]
  );
  const calendarLogs = {};
  for (const log of rawLogs) {
    let takenIds = [];
    try { takenIds = JSON.parse(log.taken_ids_json || '[]'); } catch (e) {}
    calendarLogs[log.date_str] = {
      dateStr: log.date_str,
      takenIds,
      energyLevel: log.energy_level || '',
      digestionStatus: log.digestion_status || '',
      sleepEyeStatus: log.sleep_eye_status || '',
      note: log.note || '',
      isSickMode: !!log.is_sick_mode,
      updatedBy: log.updated_by || ''
    };
  }
  return calendarLogs;
}

const LINE_BOT_BASIC_ID = process.env.LINE_BOT_BASIC_ID || '@044ihumq';

function sanitizeSlotTime(val) {
  const s = String(val || '').trim();
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s) ? s : '';
}

function parseTimeToMinutes(hhmm) {
  const clean = sanitizeSlotTime(hhmm);
  if (!clean) return null;
  const [h, m] = clean.split(':').map(Number);
  return h * 60 + m;
}

function getTaiwanDateTimeParts(nowDate = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(nowDate);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const hour = Number(map.hour === '24' ? '0' : map.hour);
  const minute = Number(map.minute);
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hour,
    minute,
    totalMinutes: hour * 60 + minute,
    timeStr: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  };
}

async function getUserReminderSettings(lineUserId = '') {
  const uid = normalizeLineUserId(lineUserId);
  const defaults = {
    enabled: false,
    morning_time: '07:00',
    noon_time: '11:50',
    evening_time: '17:50',
    bedtime_time: '22:00',
    botBasicId: LINE_BOT_BASIC_ID,
    lineMessagingConfigured: !!process.env.LINE_MESSAGING_ACCESS_TOKEN
  };
  if (!uid) return defaults;

  const row = await dbQuery.get(
    'SELECT * FROM user_reminder_settings WHERE line_user_id = ? LIMIT 1',
    [uid]
  );
  if (!row) return defaults;

  return {
    enabled: !!row.enabled,
    morning_time: sanitizeSlotTime(row.morning_time),
    noon_time: sanitizeSlotTime(row.noon_time),
    evening_time: sanitizeSlotTime(row.evening_time),
    bedtime_time: sanitizeSlotTime(row.bedtime_time),
    botBasicId: LINE_BOT_BASIC_ID,
    lineMessagingConfigured: !!process.env.LINE_MESSAGING_ACCESS_TOKEN
  };
}

/**
 * 嚴格依每款保健品的服用時段（recommended_timing / category）進行精準分流：
 * - 早上 (morning)：只推「早上空腹／餐前」「早餐／隨餐／飯後」與未指定時段的品項，絕不推播「睡前」品項
 * - 午餐 (noon)：只推「午餐／隨餐／飯後」與明確標註午餐前的品項，絕不推播「早上空腹」或「睡前」品項
 * - 晚餐 (evening)：只推「晚餐／隨餐／飯後」品項，排除「早上空腹」「睡前」與「B 群」（避免影響睡眠）
 * - 睡前 (bedtime)：只推明確標註「睡前」的品項，絕不推播白天隨餐品項
 * - 若該時段無任何符合的待服用商品，回傳空陣列 []，由排程靜音跳過不打擾使用者
 */
function buildSlotSupplementLines(slotKey, pendingItems = []) {
  if (!Array.isArray(pendingItems) || pendingItems.length === 0) {
    return [];
  }

  const lines = [];

  if (slotKey === 'bedtime') {
    for (const p of pendingItems) {
      const timing = String(p.recommended_timing || '').trim();
      if (/睡前/i.test(timing)) {
        lines.push(`【睡前】${p.brand} ${p.name}`);
      }
    }
    return lines.slice(0, 6);
  }

  const beforeItems = [];
  const afterItems = [];

  for (const p of pendingItems) {
    const timing = String(p.recommended_timing || '').trim();
    const cat = String(p.category || '').trim();
    const isBComplex = /B群|維生素B/i.test(`${cat} ${p.name || ''}`);

    // 明確標註「睡前」（且未同時標註早上／空腹）者，只允許在睡前推播，白天一律排除
    const hasBedtime = /睡前/i.test(timing);
    const hasMorning = /早|晨/i.test(timing);
    const hasNoon = /午|中餐/i.test(timing);
    const hasEvening = /晚餐|晚上/i.test(timing);
    const hasFasting = /空腹|餐前/i.test(timing);
    const hasWithMeal = /隨餐|飯後/i.test(timing);

    if (hasBedtime && !hasMorning && !hasFasting && !hasWithMeal) {
      continue;
    }

    if (slotKey === 'morning') {
      // 排除明確只屬於午餐／晚餐的品項
      if ((hasNoon || hasEvening) && !hasMorning && !hasWithMeal) continue;

      if (hasFasting) {
        beforeItems.push(p);
      } else if (hasMorning || hasWithMeal || !timing) {
        // 含未填寫特定時段的自訂商品，預設歸入早餐後提醒
        afterItems.push(p);
      }
    } else if (slotKey === 'noon') {
      // 排除僅限早上空腹、僅限早餐、僅限晚餐、僅限睡前
      if (hasFasting && !hasNoon) continue;
      if (hasMorning && !hasNoon && !hasWithMeal) continue;
      if (hasEvening && !hasNoon && !hasWithMeal) continue;

      if (hasNoon && hasFasting) {
        beforeItems.push(p);
      } else if (hasNoon || hasWithMeal) {
        afterItems.push(p);
      }
    } else if (slotKey === 'evening') {
      // 晚餐時段排除 B 群（避免夜間亢奮影響睡眠）、早上空腹與睡前品項
      if (isBComplex) continue;
      if (hasFasting && !hasEvening) continue;
      if ((hasMorning || hasNoon) && !hasEvening && !hasWithMeal) continue;

      if (hasEvening && hasFasting) {
        beforeItems.push(p);
      } else if (hasEvening || hasWithMeal) {
        afterItems.push(p);
      }
    }
  }

  const mealLabel = slotKey === 'morning' ? '早餐' : (slotKey === 'noon' ? '午餐' : '晚餐');
  for (const p of beforeItems.slice(0, 3)) {
    lines.push(`【${mealLabel}前／空腹】${p.brand} ${p.name}`);
  }
  for (const p of afterItems.slice(0, 4)) {
    lines.push(`【${mealLabel}後／隨餐】${p.brand} ${p.name}`);
  }

  return lines;
}

async function sendLinePushCard({ to, title, slotLabel, supplementLines, appUrl }) {
  const token = (process.env.LINE_MESSAGING_ACCESS_TOKEN || '').trim();
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: '伺服器尚未設定 LINE_MESSAGING_ACCESS_TOKEN 環境變數，請至 Render 後台確認。'
    };
  }

  const safeUrl = (appUrl || 'https://carenav-nin9.onrender.com').replace(/\/+$/, '');
  const calendarUrl = `${safeUrl}/?view=calendar`;
  const listText = (supplementLines && supplementLines.length > 0)
    ? supplementLines.map((line, i) => `${i + 1}. ${line}`).join('\n')
    : '請打開日曆檢視今日應服用的保健品清單並完成打卡。';

  const flexPayload = {
    to,
    messages: [
      {
        type: 'flex',
        altText: `好選保健提醒（${slotLabel}）：記得服用今日保健品並打卡`,
        contents: {
          type: 'bubble',
          size: 'kilo',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#6d28d9',
            paddingAll: '14px',
            contents: [
              {
                type: 'text',
                text: '好選保健 PurePick',
                color: '#ede9fe',
                size: 'xs',
                weight: 'bold'
              },
              {
                type: 'text',
                text: title || `每日服用提醒（${slotLabel}）`,
                color: '#ffffff',
                size: 'md',
                weight: 'bold',
                margin: 'xs'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: '14px',
            contents: [
              {
                type: 'text',
                text: `提醒時段：${slotLabel}`,
                size: 'xs',
                color: '#64748b',
                weight: 'bold'
              },
              {
                type: 'text',
                text: listText,
                size: 'sm',
                color: '#1e293b',
                wrap: true,
                margin: 'sm'
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '12px',
            contents: [
              {
                type: 'button',
                style: 'primary',
                color: '#06c755',
                height: 'sm',
                action: {
                  type: 'uri',
                  label: '開啟日曆一鍵打卡',
                  uri: calendarUrl
                }
              }
            ]
          }
        }
      }
    ]
  };

  try {
    const resp = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(flexPayload)
    });
    if (resp.ok) {
      return { ok: true, status: resp.status };
    }
    const errText = await resp.text();
    let friendly = `LINE 推播失敗（狀態碼 ${resp.status}）`;
    if (resp.status === 400) {
      friendly = `無法送達您的 LINE 帳號：請確認您已加入官方帳號 ${LINE_BOT_BASIC_ID} 為好友，且 Messaging API 與 LINE Login 屬於同一個 Provider。`;
    } else if (resp.status === 401) {
      friendly = 'LINE_MESSAGING_ACCESS_TOKEN 無效或已過期，請在 LINE Developers 重新 Issue 並更新至 Render。';
    } else if (resp.status === 429) {
      friendly = '本月 LINE 官方帳號免費推播額度已達上限。';
    }
    return { ok: false, status: resp.status, error: friendly, raw: errText };
  } catch (err) {
    return { ok: false, status: 500, error: `連線 LINE 推播伺服器失敗：${err.message}` };
  }
}

// ========================================================
// 0. 雲端健康檢查 (供 GitHub Actions 喚醒 Render 免費主機)
// ========================================================
app.get('/api/health', (req, res) => {
  const tw = getTaiwanDateTimeParts();
  res.json({
    ok: true,
    taiwanDate: tw.dateStr,
    taiwanTime: tw.timeStr,
    uptimeSec: Math.round(process.uptime())
  });
});

// ========================================================
// 1. 平台初始資料載入 (Bootstrap)
// ========================================================
app.get('/api/bootstrap', async (req, res) => {
  try {
    const lineUserId = normalizeLineUserId(req.query.lineUserId);
    const rawSupplements = await dbQuery.all('SELECT * FROM supplements ORDER BY category ASC, value_score DESC');
    const supplements = rawSupplements.map(s => {
      let nutrients = {};
      try { nutrients = JSON.parse(s.nutrients_json || '{}'); } catch (e) {}
      return { ...s, nutrients };
    });

    const { wishlist, purchased } = await getUserLists(lineUserId);
    const calendarLogs = await getUserCalendarLogs(lineUserId);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });
    const reminderSettings = await getUserReminderSettings(lineUserId);

    // 檢查該 LINE 會員是否已在資料庫登記過回饋並具備 Pro 資格
    let isPro = false;
    let userLead = null;
    if (lineUserId) {
      const leadRow = await dbQuery.get(
        'SELECT id, name, contact_value, satisfaction_score, created_at FROM leads WHERE line_user_id = ? ORDER BY id DESC LIMIT 1',
        [lineUserId]
      );
      const userRow = await dbQuery.get(
        'SELECT is_pro FROM users WHERE provider_id = ? LIMIT 1',
        [lineUserId]
      );
      if (leadRow || (userRow && userRow.is_pro === 1)) {
        isPro = true;
        userLead = leadRow || { id: 1 };
      }
    }

    res.json({
      success: true,
      data: {
        supplements,
        wishlist,
        purchased,
        calendarLogs,
        wishlistAnalysis,
        reminderSettings,
        isPro,
        hasProEntitlement: isPro,
        userLead
      }
    });
  } catch (error) {
    console.error('Bootstrap 載入錯誤:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 2. 【功能一：尋找】互動表單與自由輸入需求解析
// ========================================================
app.post('/api/finder/analyze', async (req, res) => {
  try {
    const { freeText, goals, diet, formPref, budgetTier } = req.body;
    const rawSupplements = await dbQuery.all('SELECT * FROM supplements ORDER BY value_score DESC');
    const supplements = rawSupplements.map(s => {
      let nutrients = {};
      try { nutrients = JSON.parse(s.nutrients_json || '{}'); } catch (e) {}
      return { ...s, nutrients };
    });

    const analysis = await evaluateFinderSolution({
      freeText: freeText || '',
      goals: Array.isArray(goals) ? goals : [],
      diet: diet || 'all',
      formPref: formPref || 'all',
      budgetTier: budgetTier || '1200_2000',
      supplements
    });

    res.json({ success: true, data: analysis });
  } catch (error) {
    console.error('Finder 分析錯誤:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 2.5 Google Cloud Vertex AI 保健食品拍照辨識 API
// ========================================================
app.get('/api/ai/vertex-status', (req, res) => {
  res.json({
    success: true,
    configured: isVertexAiConfigured()
  });
});

app.post('/api/ai/analyze-supplement-image', async (req, res) => {
  try {
    if (!isVertexAiConfigured()) {
      return res.status(503).json({
        success: false,
        message: '伺服器尚未設定 Google Cloud Vertex AI 憑證，目前請先手動填寫欄位。'
      });
    }

    let { imageBase64, mimeType, dataUrl } = req.body || {};
    if (dataUrl && typeof dataUrl === 'string') {
      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (match) {
        mimeType = match[1];
        imageBase64 = match[2];
      }
    }

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({
        success: false,
        message: '請先拍攝或選擇一張保健食品包裝或營養標示照片'
      });
    }

    const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    const cleanMime = String(mimeType || 'image/jpeg').toLowerCase();
    if (!allowedMimes.includes(cleanMime)) {
      return res.status(400).json({
        success: false,
        message: '不支援的圖片格式，請上傳 JPG、PNG 或 WebP 圖片'
      });
    }

    // 限制 base64 長度約 7.5MB 以內（前端也會先壓縮）
    if (imageBase64.length > 10 * 1024 * 1024) {
      return res.status(413).json({
        success: false,
        message: '圖片檔案過大，請重新拍攝或選擇較小的照片'
      });
    }

    const analysis = await analyzeSupplementImage({
      imageBase64,
      mimeType: cleanMime === 'image/jpg' ? 'image/jpeg' : cleanMime
    });

    res.json({
      success: true,
      model: analysis.model,
      location: analysis.location,
      data: analysis.result
    });
  } catch (err) {
    console.error('[Vertex AI] 保健品圖片辨識失敗:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'AI 辨識過程發生錯誤，請確認照片清晰或改為手動輸入'
    });
  }
});

// ========================================================
// 3. 新增自訂或爬取的保健食品至比價庫
// ========================================================
app.post('/api/supplements', async (req, res) => {
  try {
    const {
      brand,
      name,
      category,
      price,
      total_units,
      daily_units,
      dosage_form,
      absorption_form,
      active_summary,
      nutrient_key,
      nutrient_amount,
      nutrients: parsedNutrients,
      additives_note,
      recommended_timing,
      add_to_status,
      source_channel,
      user_name,
      line_user_id
    } = req.body;

    if (!brand || !name) {
      return res.status(400).json({ success: false, message: '請填寫品牌與商品名稱' });
    }

    const numPrice = Math.max(50, parseInt(price) || 800);
    const numTotal = Math.max(1, parseInt(total_units) || 60);
    const numDaily = Math.max(1, parseInt(daily_units) || 2);
    const daysSupply = Math.max(1, Math.round(numTotal / numDaily));
    const dailyCost = Math.round((numPrice / daysSupply) * 10) / 10;
    const monthlyCost = Math.round(dailyCost * 30);

    // 自動推算營養素結構（優先採用 AI 辨識出的多項成分，其次單一欄位，最後依類別預設）
    const nutrients = {};
    if (parsedNutrients && typeof parsedNutrients === 'object' && !Array.isArray(parsedNutrients)) {
      for (const [k, v] of Object.entries(parsedNutrients)) {
        const num = parseFloat(v);
        if (Number.isFinite(num) && num > 0) {
          nutrients[k] = num;
        }
      }
    }
    if (Object.keys(nutrients).length === 0 && nutrient_key && nutrient_amount) {
      nutrients[nutrient_key] = parseFloat(nutrient_amount) || 0;
    }
    if (Object.keys(nutrients).length === 0) {
      const catMap = {
        '魚油': { omega3: 900 },
        '葉黃素': { lutein: 10, zeaxanthin: 2 },
        '益生菌': { probiotics: 200 },
        'B群': { vitamin_b: 200 },
        '鈣鎂D': { calcium: 500, magnesium: 150, vitamin_d: 400 },
        '膠原蛋白': { collagen: 5000, vitamin_c: 50 }
      };
      Object.assign(nutrients, catMap[category] || { vitamin_b: 100 });
    }

    const result = await dbQuery.run(`
      INSERT INTO supplements (
        brand, name, category, price, total_units, daily_units, days_supply,
        daily_cost, monthly_cost, dosage_form, absorption_form, active_summary,
        nutrients_json, additives_note, value_score, pros, cons, recommended_timing, source_channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      brand.trim(),
      name.trim(),
      category || '綜合保養',
      numPrice,
      numTotal,
      numDaily,
      daysSupply,
      dailyCost,
      monthlyCost,
      dosage_form || '膠囊/錠劑',
      absorption_form || '一般標準型',
      active_summary || `${category || '核心成分'}足量配方`,
      JSON.stringify(nutrients),
      additives_note || '消費者自訂登錄商品',
      84,
      `換算每日花費約 NT$ ${Math.round(dailyCost)}，每月約 NT$ ${monthlyCost}`,
      '建議與同類別高規商品對照有效成分濃度與添加物',
      recommended_timing || '隨餐/飯後',
      source_channel || '消費者新增'
    ]);

    const newSuppId = result.id;
    const uid = normalizeLineUserId(line_user_id);

    if (add_to_status === 'wishlist' || add_to_status === 'purchased') {
      await dbQuery.run(`
        INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name, line_user_id)
        VALUES (?, ?, ?, date('now'), ?, ?, ?)
      `, [
        newSuppId,
        add_to_status,
        recommended_timing || '隨餐/飯後',
        daysSupply,
        user_name || '消費者',
        uid
      ]);
    }

    const created = await dbQuery.get('SELECT * FROM supplements WHERE id = ?', [newSuppId]);
    res.json({ success: true, data: created });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 4. 【功能二：管理】加入／移轉／刪除「有興趣清單」與「已購買清單」
// ========================================================
app.post('/api/user-supplements', async (req, res) => {
  try {
    const { supplementId, status, intakeTime, userName, lineUserId, moveFromWishlist } = req.body;
    if (!supplementId || !['wishlist', 'purchased'].includes(status)) {
      return res.status(400).json({ success: false, message: '參數不完整' });
    }

    const uid = normalizeLineUserId(lineUserId);
    const supp = await dbQuery.get('SELECT * FROM supplements WHERE id = ?', [supplementId]);
    if (!supp) {
      return res.status(404).json({ success: false, message: '找不到該商品' });
    }

    const userWhere = uid
      ? 'line_user_id = ?'
      : "(line_user_id IS NULL OR line_user_id = '')";
    const userParams = uid ? [uid] : [];

    // 若是從「有興趣清單」轉為「已購買」，先從該使用者的 wishlist 移除
    if (moveFromWishlist && status === 'purchased') {
      await dbQuery.run(
        `DELETE FROM user_supplements WHERE supplement_id = ? AND status = ? AND ${userWhere}`,
        [supplementId, 'wishlist', ...userParams]
      );
    }

    // 檢查該使用者是否已存在於相同 status
    const existing = await dbQuery.get(
      `SELECT id FROM user_supplements WHERE supplement_id = ? AND status = ? AND ${userWhere}`,
      [supplementId, status, ...userParams]
    );

    if (!existing) {
      await dbQuery.run(`
        INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name, line_user_id)
        VALUES (?, ?, ?, date('now'), ?, ?, ?)
      `, [
        supplementId,
        status,
        intakeTime || supp.recommended_timing || '隨餐/飯後',
        supp.days_supply || 30,
        userName || '消費者',
        uid
      ]);
    }

    const { wishlist, purchased } = await getUserLists(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      data: { wishlist, purchased, wishlistAnalysis }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/user-supplements/:supplementId', async (req, res) => {
  try {
    const supplementId = parseInt(req.params.supplementId, 10);
    const status = req.query.status || 'wishlist';
    const uid = normalizeLineUserId(req.query.lineUserId);

    if (uid) {
      await dbQuery.run(
        'DELETE FROM user_supplements WHERE supplement_id = ? AND status = ? AND line_user_id = ?',
        [supplementId, status, uid]
      );
    } else {
      await dbQuery.run(
        "DELETE FROM user_supplements WHERE supplement_id = ? AND status = ? AND (line_user_id IS NULL OR line_user_id = '')",
        [supplementId, status]
      );
    }

    const { wishlist, purchased } = await getUserLists(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      data: { wishlist, purchased, wishlistAnalysis }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 同步已登入使用者的清單與日曆狀態（避免雲端伺服器重啟後遺失或恢復舊資料）
app.post('/api/user-state/sync', async (req, res) => {
  try {
    const { lineUserId, userName, wishlistIds, purchasedIds, customSupplements, calendarLogs, reminderSettings } = req.body;
    const uid = normalizeLineUserId(lineUserId);
    if (!uid) {
      return res.status(400).json({ success: false, message: '缺少 LINE 使用者識別碼' });
    }

    const idMap = {};
    if (Array.isArray(customSupplements)) {
      for (const cs of customSupplements) {
        if (!cs || !cs.brand || !cs.name) continue;
        const existingSupp = await dbQuery.get(
          'SELECT id FROM supplements WHERE brand = ? AND name = ? LIMIT 1',
          [cs.brand, cs.name]
        );
        if (existingSupp) {
          idMap[cs.id] = existingSupp.id;
        } else {
          const inserted = await dbQuery.run(`
            INSERT INTO supplements (
              brand, name, category, price, total_units, daily_units, days_supply,
              daily_cost, monthly_cost, dosage_form, absorption_form, active_summary,
              nutrients_json, additives_note, value_score, pros, cons, recommended_timing, source_channel
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '消費者新增')
          `, [
            cs.brand,
            cs.name,
            cs.category || '綜合保養',
            cs.price || 800,
            cs.total_units || 60,
            cs.daily_units || 2,
            cs.days_supply || 30,
            cs.daily_cost || 27,
            cs.monthly_cost || 800,
            cs.dosage_form || '膠囊/錠劑',
            cs.absorption_form || '一般標準型',
            cs.active_summary || '日常配方',
            typeof cs.nutrients_json === 'string' ? cs.nutrients_json : JSON.stringify(cs.nutrients || {}),
            cs.additives_note || '消費者自訂登錄商品',
            cs.value_score || 84,
            cs.pros || '',
            cs.cons || '',
            cs.recommended_timing || '隨餐/飯後'
          ]);
          idMap[cs.id] = inserted.id;
        }
      }
    }

    await dbQuery.run('DELETE FROM user_supplements WHERE line_user_id = ?', [uid]);

    const resolveId = (rawId) => Number(idMap[rawId] || rawId);
    const wIds = Array.isArray(wishlistIds) ? [...new Set(wishlistIds.map(resolveId).filter(Boolean))] : [];
    const pIds = Array.isArray(purchasedIds) ? [...new Set(purchasedIds.map(resolveId).filter(Boolean))] : [];

    for (const sid of wIds) {
      const supp = await dbQuery.get('SELECT id, recommended_timing, days_supply FROM supplements WHERE id = ?', [sid]);
      if (supp) {
        await dbQuery.run(`
          INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name, line_user_id)
          VALUES (?, 'wishlist', ?, date('now'), ?, ?, ?)
        `, [sid, supp.recommended_timing || '隨餐/飯後', supp.days_supply || 30, userName || '消費者', uid]);
      }
    }

    for (const sid of pIds) {
      const supp = await dbQuery.get('SELECT id, recommended_timing, days_supply FROM supplements WHERE id = ?', [sid]);
      if (supp) {
        await dbQuery.run(`
          INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name, line_user_id)
          VALUES (?, 'purchased', ?, date('now'), ?, ?, ?)
        `, [sid, supp.recommended_timing || '隨餐/飯後', supp.days_supply || 30, userName || '消費者', uid]);
      }
    }

    if (calendarLogs && typeof calendarLogs === 'object') {
      await dbQuery.run('DELETE FROM user_calendar_logs WHERE line_user_id = ?', [uid]);
      for (const [dateStr, log] of Object.entries(calendarLogs)) {
        if (!dateStr || !log) continue;
        const cleanTaken = Array.isArray(log.takenIds) ? log.takenIds.map(resolveId).filter(Boolean) : [];
        await dbQuery.run(`
          INSERT OR REPLACE INTO user_calendar_logs (
            line_user_id, date_str, taken_ids_json, energy_level, digestion_status, sleep_eye_status, note, is_sick_mode, updated_by, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
          uid,
          dateStr,
          JSON.stringify(cleanTaken),
          log.energyLevel || '',
          log.digestionStatus || '',
          log.sleepEyeStatus || '',
          log.note || '',
          log.isSickMode ? 1 : 0,
          userName || '消費者'
        ]);
      }
    }

    if (reminderSettings && typeof reminderSettings === 'object') {
      await dbQuery.run(`
        INSERT INTO user_reminder_settings (
          line_user_id, display_name, enabled, morning_time, noon_time, evening_time, bedtime_time, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(line_user_id) DO UPDATE SET
          display_name = excluded.display_name,
          enabled = excluded.enabled,
          morning_time = excluded.morning_time,
          noon_time = excluded.noon_time,
          evening_time = excluded.evening_time,
          bedtime_time = excluded.bedtime_time,
          updated_at = CURRENT_TIMESTAMP
      `, [
        uid,
        (userName || '消費者').trim(),
        reminderSettings.enabled ? 1 : 0,
        sanitizeSlotTime(reminderSettings.morning_time),
        sanitizeSlotTime(reminderSettings.noon_time),
        sanitizeSlotTime(reminderSettings.evening_time),
        sanitizeSlotTime(reminderSettings.bedtime_time)
      ]);
    }

    const rawSupplements = await dbQuery.all('SELECT * FROM supplements ORDER BY category ASC, value_score DESC');
    const supplements = rawSupplements.map(s => {
      let nutrients = {};
      try { nutrients = JSON.parse(s.nutrients_json || '{}'); } catch (e) {}
      return { ...s, nutrients };
    });
    const { wishlist, purchased } = await getUserLists(uid);
    const syncedLogs = await getUserCalendarLogs(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });
    const syncedReminder = await getUserReminderSettings(uid);

    res.json({
      success: true,
      data: { supplements, wishlist, purchased, calendarLogs: syncedLogs, wishlistAnalysis, reminderSettings: syncedReminder }
    });
  } catch (error) {
    console.error('同步使用者狀態失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// 重新觸發「有興趣清單」深度去冗分析
app.get('/api/wishlist/analyze', async (req, res) => {
  try {
    const uid = normalizeLineUserId(req.query.lineUserId);
    const { wishlist, purchased } = await getUserLists(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });
    res.json({ success: true, data: wishlistAnalysis });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 5. 【功能三：服用日曆】每日打卡與身體日誌 (Calendar Logs)
// ========================================================
app.post('/api/calendar/log', async (req, res) => {
  try {
    const { dateStr, takenIds, energyLevel, digestionStatus, sleepEyeStatus, note, isSickMode, updatedBy, lineUserId } = req.body;
    if (!dateStr) {
      return res.status(400).json({ success: false, message: '缺少日期參數' });
    }

    const uid = normalizeLineUserId(lineUserId);
    const cleanTaken = Array.isArray(takenIds) ? takenIds.map(x => Number(x)) : [];

    await dbQuery.run(`
      INSERT INTO user_calendar_logs (line_user_id, date_str, taken_ids_json, energy_level, digestion_status, sleep_eye_status, note, is_sick_mode, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id, date_str) DO UPDATE SET
        taken_ids_json = excluded.taken_ids_json,
        energy_level = excluded.energy_level,
        digestion_status = excluded.digestion_status,
        sleep_eye_status = excluded.sleep_eye_status,
        note = excluded.note,
        is_sick_mode = excluded.is_sick_mode,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [
      uid,
      dateStr,
      JSON.stringify(cleanTaken),
      energyLevel || '',
      digestionStatus || '',
      sleepEyeStatus || '',
      note || '',
      isSickMode ? 1 : 0,
      updatedBy || '消費者'
    ]);

    res.json({
      success: true,
      data: {
        dateStr,
        takenIds: cleanTaken,
        energyLevel: energyLevel || '',
        digestionStatus: digestionStatus || '',
        sleepEyeStatus: sleepEyeStatus || '',
        note: note || '',
        isSickMode: !!isSickMode,
        updatedBy: updatedBy || '消費者'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 6. 示範資料清空與還原 (僅操作對應使用者或示範帳號，不互相覆蓋)
// ========================================================
app.post('/api/demo/clear', async (req, res) => {
  try {
    const uid = normalizeLineUserId(req.body?.lineUserId);
    await clearUserPersonalData(uid);
    const { wishlist, purchased } = await getUserLists(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });
    res.json({
      success: true,
      data: { wishlist, purchased, calendarLogs: {}, wishlistAnalysis }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/demo/restore', async (req, res) => {
  try {
    await restoreDemoData();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 7. LINE 第三方登入認證 (LINE Login OAuth 2.0)
// ========================================================
app.get('/api/auth/config', (req, res) => {
  const lineConfigured = !!(process.env.LINE_CHANNEL_ID && process.env.LINE_CHANNEL_SECRET);
  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const defaultCallback = `${protocol}://${host}/auth/line/callback`;

  res.json({
    success: true,
    data: {
      lineConfigured,
      channelId: process.env.LINE_CHANNEL_ID ? `${process.env.LINE_CHANNEL_ID.slice(0, 4)}****` : null,
      callbackUrl: process.env.LINE_CALLBACK_URL || defaultCallback
    }
  });
});

app.get('/auth/line', (req, res) => {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelId || !channelSecret) {
    return res.redirect('/?auth_notice=line_config_needed');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const callbackUrl = process.env.LINE_CALLBACK_URL || `${protocol}://${host}/auth/line/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=profile%20openid&bot_prompt=normal`;
  res.redirect(authUrl);
});

app.get('/auth/line/callback', async (req, res) => {
  const { code, error, error_description } = req.query;

  if (error) {
    return res.redirect(`/?auth_error=${encodeURIComponent(error_description || error)}`);
  }
  if (!code) {
    return res.redirect('/?auth_error=no_code');
  }

  try {
    const channelId = process.env.LINE_CHANNEL_ID;
    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const callbackUrl = process.env.LINE_CALLBACK_URL || `${protocol}://${host}/auth/line/callback`;

    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret
      }).toString()
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.access_token) {
      return res.redirect(`/?auth_error=${encodeURIComponent(tokenData.error_description || '換取 Token 失敗')}`);
    }

    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    const existingLead = await dbQuery.get('SELECT id FROM leads WHERE line_user_id = ? LIMIT 1', [profile.userId]);
    const isProUser = existingLead ? 1 : 0;

    const existing = await dbQuery.get('SELECT id, is_pro FROM users WHERE provider_id = ?', [profile.userId]);
    if (existing) {
      const proFlag = (existing.is_pro === 1 || isProUser === 1) ? 1 : 0;
      await dbQuery.run(
        'UPDATE users SET display_name = ?, picture_url = ?, is_pro = ? WHERE id = ?',
        [profile.displayName || 'LINE 用戶', profile.pictureUrl || null, proFlag, existing.id]
      );
    } else {
      await dbQuery.run(
        'INSERT INTO users (provider, provider_id, display_name, picture_url, family_role, is_pro) VALUES (\'line\', ?, ?, ?, \'消費者\', ?)',
        [profile.userId, profile.displayName || 'LINE 用戶', profile.pictureUrl || null, isProUser]
      );
    }

    res.redirect(`/?line_login=success&name=${encodeURIComponent(profile.displayName || 'LINE 用戶')}&pic=${encodeURIComponent(profile.pictureUrl || '')}&uid=${encodeURIComponent(profile.userId)}&pro=${isProUser}`);
  } catch (err) {
    res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// ========================================================
// 8. 潛在消費者名單登記與流程順暢回饋 (Lead Capture & Feedback - LINE 實名專屬)
// ========================================================
app.post('/api/leads', async (req, res) => {
  try {
    const { name, age, email, contact_value, satisfaction_score, note, source, line_user_id } = req.body;
    const finalName = (name || '').trim();
    const finalAge = (age || '').trim();
    const finalEmail = (email || contact_value || '').trim();
    const finalLineUserId = (line_user_id || '').trim();

    // 嚴格評審防灌水機制：強制驗證 LINE 實名帳號
    if (!finalLineUserId) {
      return res.status(401).json({
        success: false,
        message: '為確保名單真實性與杜絕灌水，請先以 LINE 帳號登入後再進行登記'
      });
    }

    if (!finalName) {
      return res.status(400).json({ success: false, message: '請填寫您的稱呼或姓名' });
    }
    if (!finalEmail) {
      return res.status(400).json({ success: false, message: '請填寫電子信箱 (Email)' });
    }

    const score = Math.max(1, Math.min(5, parseInt(satisfaction_score, 10) || 5));

    // 若為伺服器重啟後的自動回寫，避免重複寫入多筆
    if (source === 'auto_restore_after_restart') {
      const existingLead = await dbQuery.get(
        'SELECT id FROM leads WHERE line_user_id = ? LIMIT 1',
        [finalLineUserId]
      );
      if (existingLead) {
        await dbQuery.run('UPDATE users SET is_pro = 1 WHERE provider_id = ?', [finalLineUserId]);
        return res.json({
          success: true,
          message: '已確認 Pro 資格存在。',
          data: { leadId: existingLead.id, satisfactionScore: score, isPro: true }
        });
      }
    }

    const result = await dbQuery.run(`
      INSERT INTO leads (name, age, contact_type, contact_value, line_user_id, health_goal, monthly_budget, satisfaction_score, note, source)
      VALUES (?, ?, 'email', ?, ?, '', '', ?, ?, ?)
    `, [
      finalName,
      finalAge,
      finalEmail,
      finalLineUserId,
      score,
      note ? note.trim() : '',
      source || 'web_feedback_pro'
    ]);

    // 同步更新 users 表中該 LINE 帳號的 is_pro 狀態
    await dbQuery.run(
      'UPDATE users SET is_pro = 1 WHERE provider_id = ?',
      [finalLineUserId]
    );

    res.json({
      success: true,
      message: '感謝您的回饋！已為您免費開通 Pro 完整去冗精算與動態身體日誌權限。',
      data: { leadId: result.id, satisfactionScore: score, isPro: true }
    });
  } catch (error) {
    console.error('儲存留名單回饋失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 8.1 手機 Web App 分享與文字貼上快速匯入保健品（自動過濾非保健品）
// ========================================================
app.post('/api/purchased/quick-import', async (req, res) => {
  try {
    const { brand, name, category, price, active_summary, recommended_timing, source_channel, lineUserId, userName } = req.body;
    const uid = normalizeLineUserId(lineUserId);
    const rawName = (name || '').trim();
    if (!rawName) {
      return res.status(400).json({ success: false, message: '請輸入或分享保健品名稱' });
    }

    // 嚴格過濾非保健食品 (避免洋芋片、零食、生活用品誤入)
    const SUPPLEMENT_REGEX = /(?:魚油|藻油|Omega|EPA|DHA|葉黃素|玉米黃素|晶亮|金盞花|蝦紅素|花青素|B群|維生素B|維他命B|維生素|維他命|益生菌|乳酸菌|酵素|納豆|紅麴|薑黃|瑪卡|芝麻素|鈣|檸檬酸鈣|海藻鈣|鎂|鋅|鐵|膠原蛋白|玻尿酸|UC-II|葡萄糖胺|軟骨素|發泡錠)/i;
    if (!SUPPLEMENT_REGEX.test(rawName)) {
      return res.status(400).json({
        success: false,
        message: '未偵測到保健食品關鍵字（系統僅收錄保健品，已自動排除零食與一般日用品）'
      });
    }

    // 檢查現有商品庫是否已有相似商品
    let supp = await dbQuery.get(
      'SELECT * FROM supplements WHERE name LIKE ? OR brand LIKE ? ORDER BY value_score DESC LIMIT 1',
      [`%${rawName.slice(0, 6)}%`, `%${rawName.slice(0, 4)}%`]
    );

    // 若直接用關鍵字對應品類商品
    if (!supp) {
      const catGuess = rawName.includes('魚油') || rawName.includes('藻油') ? '魚油'
        : (rawName.includes('葉黃素') || rawName.includes('金盞花') ? '葉黃素'
        : (rawName.includes('益生菌') || rawName.includes('乳酸菌') ? '益生菌'
        : (rawName.includes('鈣') || rawName.includes('鎂') ? '鈣鎂D'
        : (rawName.includes('膠原') ? '膠原蛋白' : 'B群'))));

      const cleanBrand = brand || (rawName.includes('大研') ? '大研生醫'
        : (rawName.includes('好市多') || rawName.includes('科克蘭') ? '科克蘭 Kirkland'
        : (rawName.includes('善存') ? '善存 Centrum'
        : (rawName.includes('DHC') ? 'DHC'
        : (rawName.includes('威德') ? '威德 WEIDER' : '市售通路品牌')))));

      const p = parseInt(price, 10) || 890;
      const timing = recommended_timing || (catGuess === '魚油' || catGuess === '葉黃素' ? '隨餐/飯後' : (catGuess === 'B群' ? '早上飯後' : '睡前'));
      const newSupp = await dbQuery.run(`
        INSERT INTO supplements (
          brand, name, category, price, total_units, daily_units, days_supply, daily_cost, monthly_cost,
          dosage_form, absorption_form, active_summary, nutrients_json, additives_note, value_score,
          pros, cons, recommended_timing, is_vegan, source_channel
        ) VALUES (?, ?, ?, ?, 60, 2, 30, ?, ?, '膠囊/錠劑', '一般標準型', ?, '{}', '一般配方', 86, '由手機分享或快速貼上匯入', '建議依照包裝指示每日規律服用', ?, 0, ?)
      `, [
        cleanBrand,
        rawName,
        catGuess,
        p,
        Math.round(p / 30),
        p,
        active_summary || `${catGuess} 主要營養成分`,
        timing,
        source_channel || '手機分享匯入'
      ]);
      supp = await dbQuery.get('SELECT * FROM supplements WHERE id = ?', [newSupp.id]);
    }

    const supplementId = supp.id;

    const userWhere = uid
      ? 'line_user_id = ?'
      : "(line_user_id IS NULL OR line_user_id = '')";
    const userParams = uid ? [uid] : [];

    const existing = await dbQuery.get(
      `SELECT id FROM user_supplements WHERE supplement_id = ? AND status = ? AND ${userWhere}`,
      [supplementId, 'purchased', ...userParams]
    );

    if (!existing) {
      await dbQuery.run(`
        INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name, line_user_id)
        VALUES (?, 'purchased', ?, date('now'), 30, ?, ?)
      `, [
        supplementId,
        recommended_timing || (supp ? supp.recommended_timing : '隨餐/飯後'),
        userName || '消費者',
        uid
      ]);
    }

    const { wishlist, purchased } = await getUserLists(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      message: `已將「${supp.brand}｜${supp.name}」加入「告知醫生目前使用的保健品」清單！`,
      data: { wishlist, purchased, wishlistAnalysis, supplementId }
    });
  } catch (error) {
    console.error('快速匯入已購商品失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/leads', async (req, res) => {
  try {
    const rows = await dbQuery.all('SELECT * FROM leads ORDER BY id DESC');
    res.json({
      success: true,
      count: rows.length,
      data: rows
    });
  } catch (error) {
    console.error('讀取留名單失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/leads/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    await dbQuery.run('DELETE FROM leads WHERE id = ?', [id]);
    res.json({ success: true, message: '已刪除此筆名單' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 9. LINE 每日服用提醒設定、即時測試推播與 GitHub Actions 定時排程
// ========================================================
app.get('/api/reminders/settings', async (req, res) => {
  try {
    const lineUserId = normalizeLineUserId(req.query.lineUserId);
    const data = await getUserReminderSettings(lineUserId);
    res.json({ success: true, data });
  } catch (error) {
    console.error('讀取提醒設定失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/reminders/settings', async (req, res) => {
  try {
    const {
      lineUserId,
      displayName,
      enabled,
      morning_time,
      noon_time,
      evening_time,
      bedtime_time
    } = req.body;

    const uid = normalizeLineUserId(lineUserId);
    if (!uid) {
      return res.status(401).json({ success: false, message: '請先以 LINE 帳號登入後再設定提醒' });
    }

    const mTime = sanitizeSlotTime(morning_time);
    const nTime = sanitizeSlotTime(noon_time);
    const eTime = sanitizeSlotTime(evening_time);
    const bTime = sanitizeSlotTime(bedtime_time);
    const isEnabled = enabled ? 1 : 0;

    if (isEnabled && !mTime && !nTime && !eTime && !bTime) {
      return res.status(400).json({ success: false, message: '開啟提醒時，請至少勾選一個提醒時段' });
    }

    await dbQuery.run(`
      INSERT INTO user_reminder_settings (
        line_user_id, display_name, enabled, morning_time, noon_time, evening_time, bedtime_time, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(line_user_id) DO UPDATE SET
        display_name = excluded.display_name,
        enabled = excluded.enabled,
        morning_time = excluded.morning_time,
        noon_time = excluded.noon_time,
        evening_time = excluded.evening_time,
        bedtime_time = excluded.bedtime_time,
        updated_at = CURRENT_TIMESTAMP
    `, [uid, (displayName || '').trim(), isEnabled, mTime, nTime, eTime, bTime]);

    const updated = await getUserReminderSettings(uid);
    res.json({
      success: true,
      message: isEnabled ? '已儲存 LINE 每日服用提醒設定！' : '已暫停 LINE 每日服用提醒。',
      data: updated
    });
  } catch (error) {
    console.error('儲存提醒設定失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/reminders/test', async (req, res) => {
  try {
    const { lineUserId, displayName } = req.body;
    const uid = normalizeLineUserId(lineUserId);
    if (!uid) {
      return res.status(401).json({ success: false, message: '請先登入 LINE 帳號才能發送測試提醒' });
    }

    const { purchased } = await getUserLists(uid);
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const appUrl = process.env.PUBLIC_APP_URL || `${protocol}://${host}`;

    const supplementLines = purchased.length > 0
      ? purchased.slice(0, 6).map(p => `${p.brand} ${p.name}（${p.recommended_timing || '依包裝建議'}）`)
      : ['您尚未加入已購買保健品，之後加入的商品會自動顯示在這裡'];

    const pushRes = await sendLinePushCard({
      to: uid,
      title: `${displayName ? displayName + ' 您好，' : ''}這是 PurePick 測試提醒`,
      slotLabel: '即時測試推播',
      supplementLines,
      appUrl
    });

    if (!pushRes.ok) {
      return res.status(pushRes.status >= 400 && pushRes.status < 600 ? pushRes.status : 500).json({
        success: false,
        message: pushRes.error
      });
    }

    res.json({
      success: true,
      message: '測試提醒已發送！請立刻檢查您的 LINE 訊息。'
    });
  } catch (error) {
    console.error('發送測試提醒失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GitHub Actions 定時排程呼叫端點（強制驗證 REMINDER_CRON_SECRET）
app.post('/api/cron/send-reminders', async (req, res) => {
  try {
    const expectedSecret = (process.env.REMINDER_CRON_SECRET || '').trim();
    if (!expectedSecret) {
      return res.status(503).json({
        success: false,
        message: '伺服器尚未設定 REMINDER_CRON_SECRET 環境變數'
      });
    }

    const authHeader = req.get('authorization') || '';
    const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const provided = (req.get('x-cron-secret') || bearer || '').trim();

    if (!provided || provided !== expectedSecret) {
      return res.status(401).json({ success: false, message: '無效的排程驗證密鑰' });
    }

    if (!(process.env.LINE_MESSAGING_ACCESS_TOKEN || '').trim()) {
      return res.status(503).json({
        success: false,
        message: '伺服器尚未設定 LINE_MESSAGING_ACCESS_TOKEN 環境變數'
      });
    }

    const tw = getTaiwanDateTimeParts();
    const host = req.get('host');
    const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
    const appUrl = process.env.PUBLIC_APP_URL || `${protocol}://${host}`;

    const rows = await dbQuery.all(
      'SELECT * FROM user_reminder_settings WHERE enabled = 1'
    );

    const slotDefs = [
      { key: 'morning', col: 'morning_time', label: '早餐前／後' },
      { key: 'noon', col: 'noon_time', label: '午餐前／後' },
      { key: 'evening', col: 'evening_time', label: '晚餐前／後' },
      { key: 'bedtime', col: 'bedtime_time', label: '睡前' }
    ];

    let sentCount = 0;
    let skippedCount = 0;
    const details = [];

    for (const row of rows) {
      const uid = normalizeLineUserId(row.line_user_id);
      if (!uid) continue;

      let lastSent = {};
      try { lastSent = JSON.parse(row.last_sent_slots || '{}'); } catch (e) {}

      // 只保留今日紀錄，避免 JSON 無限膨脹
      const cleanedSent = {};
      for (const [k, v] of Object.entries(lastSent)) {
        if (k.startsWith(tw.dateStr + '_')) cleanedSent[k] = v;
      }

      // 檢查今日是否開啟「生病休養暫停服用模式」
      const todayLog = await dbQuery.get(
        'SELECT taken_ids_json, is_sick_mode FROM user_calendar_logs WHERE line_user_id = ? AND date_str = ? LIMIT 1',
        [uid, tw.dateStr]
      );
      if (todayLog && todayLog.is_sick_mode === 1) {
        skippedCount += 1;
        details.push({ user: row.display_name || uid.slice(0, 6), reason: 'sick_mode_paused' });
        continue;
      }

      let takenIds = [];
      if (todayLog && todayLog.taken_ids_json) {
        try { takenIds = JSON.parse(todayLog.taken_ids_json).map(Number); } catch (e) {}
      }
      const takenSet = new Set(takenIds);

      const { purchased } = await getUserLists(uid);
      const pendingItems = purchased.filter(p => !takenSet.has(Number(p.id)));

      let modifiedSent = false;

      for (const slot of slotDefs) {
        const slotTime = sanitizeSlotTime(row[slot.col]);
        if (!slotTime) continue;

        const slotMin = parseTimeToMinutes(slotTime);
        if (slotMin === null) continue;

        const sentKey = `${tw.dateStr}_${slot.key}`;
        if (cleanedSent[sentKey]) continue;

        // 配合每 10 分鐘 GitHub Actions 排程，允許 0 ~ 25 分鐘容錯視窗，準時觸發且絕不重複發送
        const diff = tw.totalMinutes - slotMin;
        if (diff >= 0 && diff <= 25) {
          if (purchased.length === 0) {
            cleanedSent[sentKey] = 'no_purchased';
            modifiedSent = true;
            skippedCount += 1;
            details.push({ user: row.display_name || uid.slice(0, 6), slot: slot.key, reason: 'no_purchased_items' });
            continue;
          }

          if (pendingItems.length === 0) {
            // 今日全部保健品皆已吃完打卡，不打擾使用者
            cleanedSent[sentKey] = 'all_taken';
            modifiedSent = true;
            skippedCount += 1;
            details.push({ user: row.display_name || uid.slice(0, 6), slot: slot.key, reason: 'already_all_taken' });
            continue;
          }

          const lines = buildSlotSupplementLines(slot.key, pendingItems);
          if (lines.length === 0) {
            // 該時段無對應要服用的保健品（例如早上 7 點不推睡前品項、睡前不推白天 B 群），靜音跳過並省下推播額度
            cleanedSent[sentKey] = 'no_slot_items';
            modifiedSent = true;
            skippedCount += 1;
            details.push({ user: row.display_name || uid.slice(0, 6), slot: slot.key, reason: 'no_matching_items_for_slot' });
            continue;
          }

          const pushRes = await sendLinePushCard({
            to: uid,
            title: `${slot.label}提醒（${slotTime}）`,
            slotLabel: `${slot.label} ${slotTime}`,
            supplementLines: lines,
            appUrl
          });

          if (pushRes.ok) {
            cleanedSent[sentKey] = tw.timeStr;
            modifiedSent = true;
            sentCount += 1;
            details.push({ user: row.display_name || uid.slice(0, 6), slot: slot.key, status: 'sent' });
          } else {
            details.push({ user: row.display_name || uid.slice(0, 6), slot: slot.key, status: 'failed', error: pushRes.error });
          }
        }
      }

      if (modifiedSent) {
        await dbQuery.run(
          'UPDATE user_reminder_settings SET last_sent_slots = ?, updated_at = CURRENT_TIMESTAMP WHERE line_user_id = ?',
          [JSON.stringify(cleanedSent), uid]
        );
      }
    }

    res.json({
      success: true,
      taiwanDate: tw.dateStr,
      taiwanTime: tw.timeStr,
      checkedUsers: rows.length,
      sentCount,
      skippedCount,
      details
    });
  } catch (error) {
    console.error('排程推播失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`[PurePick] 跨品牌保健食品比較與管理平台已啟動`);
  console.log(`[PurePick] 平台網址： http://localhost:${PORT}`);
  console.log(`====================================================`);
});
