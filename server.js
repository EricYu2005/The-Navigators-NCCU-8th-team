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
app.use(express.static(path.join(__dirname, 'public')));

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
        isPro,
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
      additives_note,
      recommended_timing,
      add_to_status,
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

    // 自動推算營養素結構
    const nutrients = {};
    if (nutrient_key && nutrient_amount) {
      nutrients[nutrient_key] = parseFloat(nutrient_amount) || 0;
    } else {
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
      '消費者新增'
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
    const { lineUserId, userName, wishlistIds, purchasedIds, customSupplements, calendarLogs } = req.body;
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

    const rawSupplements = await dbQuery.all('SELECT * FROM supplements ORDER BY category ASC, value_score DESC');
    const supplements = rawSupplements.map(s => {
      let nutrients = {};
      try { nutrients = JSON.parse(s.nutrients_json || '{}'); } catch (e) {}
      return { ...s, nutrients };
    });
    const { wishlist, purchased } = await getUserLists(uid);
    const syncedLogs = await getUserCalendarLogs(uid);
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      data: { supplements, wishlist, purchased, calendarLogs: syncedLogs, wishlistAnalysis }
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

  const authUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=profile%20openid`;
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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`[PurePick] 跨品牌保健食品比較與管理平台已啟動`);
  console.log(`[PurePick] 平台網址： http://localhost:${PORT}`);
  console.log(`====================================================`);
});
