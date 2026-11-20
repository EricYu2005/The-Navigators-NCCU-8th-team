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
app.use(express.static(path.join(__dirname, 'public')));

/**
 * 輔助函式：取得目前的「有興趣清單 (wishlist)」與「已購買清單 (purchased)」完整商品資料
 */
async function getUserLists() {
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
    ORDER BY us.id DESC
  `);

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

// ========================================================
// 1. 平台初始資料載入 (Bootstrap)
// ========================================================
app.get('/api/bootstrap', async (req, res) => {
  try {
    const rawSupplements = await dbQuery.all('SELECT * FROM supplements ORDER BY category ASC, value_score DESC');
    const supplements = rawSupplements.map(s => {
      let nutrients = {};
      try { nutrients = JSON.parse(s.nutrients_json || '{}'); } catch (e) {}
      return { ...s, nutrients };
    });

    const { wishlist, purchased } = await getUserLists();
    const rawLogs = await dbQuery.all('SELECT * FROM calendar_logs ORDER BY date_str ASC');
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
        updatedBy: log.updated_by || ''
      };
    }

    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      data: {
        supplements,
        wishlist,
        purchased,
        calendarLogs,
        wishlistAnalysis
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
      user_name
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

    if (add_to_status === 'wishlist' || add_to_status === 'purchased') {
      await dbQuery.run(`
        INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name)
        VALUES (?, ?, ?, date('now'), ?, ?)
      `, [
        newSuppId,
        add_to_status,
        recommended_timing || '隨餐/飯後',
        daysSupply,
        user_name || '消費者'
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

    const supp = await dbQuery.get('SELECT * FROM supplements WHERE id = ?', [supplementId]);
    if (!supp) {
      return res.status(404).json({ success: false, message: '找不到該商品' });
    }

    // 若是從「有興趣清單」轉為「已購買」，先從 wishlist 移除
    if (moveFromWishlist && status === 'purchased') {
      await dbQuery.run(
        'DELETE FROM user_supplements WHERE supplement_id = ? AND status = ?',
        [supplementId, 'wishlist']
      );
    }

    // 檢查是否已存在於相同 status
    const existing = await dbQuery.get(
      'SELECT id FROM user_supplements WHERE supplement_id = ? AND status = ?',
      [supplementId, status]
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
        lineUserId || null
      ]);
    }

    const { wishlist, purchased } = await getUserLists();
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
    const supplementId = parseInt(req.params.supplementId);
    const status = req.query.status || 'wishlist';

    await dbQuery.run(
      'DELETE FROM user_supplements WHERE supplement_id = ? AND status = ?',
      [supplementId, status]
    );

    const { wishlist, purchased } = await getUserLists();
    const wishlistAnalysis = await evaluateWishlistPortfolio({ wishlist, purchased });

    res.json({
      success: true,
      data: { wishlist, purchased, wishlistAnalysis }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 重新觸發「有興趣清單」深度去冗分析
app.get('/api/wishlist/analyze', async (req, res) => {
  try {
    const { wishlist, purchased } = await getUserLists();
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
    const { dateStr, takenIds, energyLevel, digestionStatus, sleepEyeStatus, note, updatedBy } = req.body;
    if (!dateStr) {
      return res.status(400).json({ success: false, message: '缺少日期參數' });
    }

    const cleanTaken = Array.isArray(takenIds) ? takenIds.map(x => Number(x)) : [];

    await dbQuery.run(`
      INSERT INTO calendar_logs (date_str, taken_ids_json, energy_level, digestion_status, sleep_eye_status, note, updated_by, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date_str) DO UPDATE SET
        taken_ids_json = excluded.taken_ids_json,
        energy_level = excluded.energy_level,
        digestion_status = excluded.digestion_status,
        sleep_eye_status = excluded.sleep_eye_status,
        note = excluded.note,
        updated_by = excluded.updated_by,
        updated_at = CURRENT_TIMESTAMP
    `, [
      dateStr,
      JSON.stringify(cleanTaken),
      energyLevel || '',
      digestionStatus || '',
      sleepEyeStatus || '',
      note || '',
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
        updatedBy: updatedBy || '消費者'
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 6. 示範資料清空與還原 (方便組員登入打自己的保健品或恢復預設報告案例)
// ========================================================
app.post('/api/demo/clear', async (req, res) => {
  try {
    await clearUserPersonalData();
    const { wishlist, purchased } = await getUserLists();
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

    const existing = await dbQuery.get('SELECT id FROM users WHERE provider_id = ?', [profile.userId]);
    if (existing) {
      await dbQuery.run(
        'UPDATE users SET display_name = ?, picture_url = ? WHERE id = ?',
        [profile.displayName || 'LINE 用戶', profile.pictureUrl || null, existing.id]
      );
    } else {
      await dbQuery.run(
        'INSERT INTO users (provider, provider_id, display_name, picture_url, family_role) VALUES (\'line\', ?, ?, ?, \'消費者\')',
        [profile.userId, profile.displayName || 'LINE 用戶', profile.pictureUrl || null]
      );
    }

    res.redirect(`/?line_login=success&name=${encodeURIComponent(profile.displayName || 'LINE 用戶')}&pic=${encodeURIComponent(profile.pictureUrl || '')}&uid=${encodeURIComponent(profile.userId)}`);
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

    res.json({
      success: true,
      message: '感謝您的回饋！已為您免費開通 Pro 完整去冗精算與動態身體日誌權限。',
      data: { leadId: result.id, satisfactionScore: score }
    });
  } catch (error) {
    console.error('儲存留名單回饋失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 8.1 擴充套件專用：從 momo 購物網等電商一鍵同步已購保健品至日曆櫃
// ========================================================
app.post('/api/purchased/sync-from-extension', async (req, res) => {
  try {
    const { brand, name, category, price, active_summary, recommended_timing, source_channel } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: '商品名稱不能為空' });
    }

    // 嚴格過濾非保健食品 (避免洋芋片、生活用品誤入)
    const SUPPLEMENT_REGEX = /(?:魚油|藻油|Omega|EPA|DHA|葉黃素|玉米黃素|晶亮|金盞花|蝦紅素|花青素|B群|維生素B|維他命B|維生素|維他命|益生菌|乳酸菌|酵素|納豆|紅麴|薑黃|瑪卡|芝麻素|鈣|檸檬酸鈣|海藻鈣|鎂|鋅|鐵|膠原蛋白|玻尿酸|UC-II|葡萄糖胺|軟骨素|發泡錠)/i;
    if (!SUPPLEMENT_REGEX.test(name)) {
      return res.status(400).json({ success: false, message: '非保健食品，系統已自動略過（不記錄洋芋片等非營養品）' });
    }

    // 檢查現有商品庫是否已有相似商品
    let supp = await dbQuery.get('SELECT * FROM supplements WHERE name LIKE ? OR (brand = ? AND category = ?)', [
      `%${name.trim().slice(0, 8)}%`,
      brand || 'momo嚴選',
      category || '綜合保養'
    ]);

    let supplementId;
    if (supp) {
      supplementId = supp.id;
    } else {
      const cat = category || (name.includes('魚油') ? '魚油' : (name.includes('葉黃素') ? '葉黃素' : (name.includes('益生菌') ? '益生菌' : (name.includes('B') ? 'B群' : '綜合保養'))));
      const p = parseInt(price, 10) || 890;
      const timing = recommended_timing || (cat === '魚油' || cat === '葉黃素' ? '隨餐/飯後' : (cat === 'B群' ? '早晨/日間' : '睡前'));
      const newSupp = await dbQuery.run(`
        INSERT INTO supplements (
          brand, name, category, price, total_units, daily_units, days_supply, daily_cost, monthly_cost,
          dosage_form, absorption_form, active_summary, nutrients_json, additives_note, value_score,
          pros, cons, recommended_timing, is_vegan, source_channel
        ) VALUES (?, ?, ?, ?, 60, 2, 30, ?, ?, '軟膠囊', '專利標準型', ?, '{}', '純淨配方', 88, '從電商購物車即時同步匯入', '日常基礎打底', ?, 0, ?)
      `, [
        brand || 'momo嚴選',
        name.trim(),
        cat,
        p,
        Math.round(p / 30),
        p,
        active_summary || `${cat} 有效成分添加`,
        timing,
        source_channel || 'momo購物網'
      ]);
      supplementId = newSupp.id;
    }

    // 寫入 user_supplements purchased 清單
    const existing = await dbQuery.get(
      'SELECT id FROM user_supplements WHERE supplement_id = ? AND status = ?',
      [supplementId, 'purchased']
    );

    if (!existing) {
      await dbQuery.run(`
        INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name)
        VALUES (?, 'purchased', ?, date('now'), 30, '消費者')
      `, [
        supplementId,
        recommended_timing || (supp ? supp.recommended_timing : '隨餐/飯後')
      ]);
    }

    const { wishlist, purchased } = await getUserLists();
    res.json({
      success: true,
      message: `已成功將「${name.trim()}」同步至您的 PurePick 服用日曆櫃！`,
      data: { purchasedCount: purchased.length, supplementId }
    });
  } catch (error) {
    console.error('擴充套件同步已購商品失敗:', error);
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

// 提供 Chrome 擴充套件壓縮檔一鍵下載
app.get('/download/extension', (req, res) => {
  const zipPath = path.join(__dirname, 'public', 'purepick-extension.zip');
  if (fs.existsSync(zipPath)) {
    res.download(zipPath, 'purepick-extension.zip');
  } else {
    res.status(404).json({ success: false, message: '擴充套件檔案尚未打包' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`[PurePick] 跨品牌保健食品比較與管理平台已啟動`);
  console.log(`[PurePick] 平台網址： http://localhost:${PORT}`);
  console.log(`====================================================`);
});
