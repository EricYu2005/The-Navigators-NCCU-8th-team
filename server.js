/**
 * server.js
 * CareNav 智護領航 - 核心 API 伺服器
 * 
 * 雙大核心面向（資訊平台與數據軌跡）：
 * 1. 雙管道與逾時狀態監控 (/api/pipelines/status)
 * 2. 診後口頭醫囑轉譯 (專屬管道: VerbalOrderPipeline -> /api/verbal-orders, /api/verbal-orders/parse)
 * 3. 藥袋代碼逆向推導與 DrugBank MCP 藥理審核 (專屬管道: PrescriptionMcpPipeline -> /api/prescriptions, /api/prescriptions/infer)
 * 4. 全家照護雲端看板 (專屬管道: FamilyCarePipeline -> /api/dashboard, /api/family-notes)
 * 5. 在地醫院 Hub 陪診媒合 (/api/hub-bookings)
 * 6. 本機 Ollama 連線狀態查詢 (/api/ollama/status)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { dbQuery, clearDemoData, restoreDemoData, saveCustomPatientData } = require('./database');
const { checkOllamaConnection } = require('./ollamaService');
const {
  getPipelinesStatus,
  VerbalOrderPipeline,
  PrescriptionMcpPipeline,
  FamilyCarePipeline
} = require('./llmPipelines');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// 提高 JSON payload 上限以支援拍照藥袋 Base64 圖片上傳
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

// 醫學處方代碼字典
const MEDICAL_CODES = {
  'QD': '每日一次 (固定時間)',
  'QD AM': '每日一次 (早晨服用)',
  'QD PM': '每日一次 (傍晚服用)',
  'QD HS': '每日一次 (睡前服用)',
  'BID': '每日兩次 (早晚服用)',
  'TID': '每日三次 (早中晚服用)',
  'QID': '每日四次 (早中晚及睡前)',
  'QOD': '每隔一日服用一次',
  'Q4H': '每 4 小時服用一次',
  'Q6H': '每 6 小時服用一次',
  'AC': '飯前服用 (餐前半小時)',
  'PC': '飯後服用 (餐後半小時)',
  'PRN': '需要時才服用 (有症狀時)',
  'STAT': '立即服用一次'
};

// ========================================================
// 0. 雙 LLM 呼叫管道與各功能專屬管道狀態監控
// ========================================================
app.get('/api/pipelines/status', async (req, res) => {
  try {
    const statusData = await getPipelinesStatus();
    res.json({ success: true, data: statusData });
  } catch (error) {
    console.error('查詢管道狀態失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 0.1 臨床 Demo 情境檔案管理 (/api/scenarios)
// 支援從 scenarios/ 目錄讀取自訂 JSON 檔案，或由使用者自行擴充上傳
// ========================================================
const SCENARIOS_DIR = path.join(__dirname, 'scenarios');

app.get('/api/scenarios', (req, res) => {
  try {
    if (!fs.existsSync(SCENARIOS_DIR)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(SCENARIOS_DIR).filter(f => f.endsWith('.json'));
    const list = files.map(filename => {
      try {
        const content = JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, filename), 'utf8'));
        return {
          filename,
          scenarioId: content.scenarioId || filename.replace('.json', ''),
          title: content.title || filename,
          description: content.description || '',
          patientName: content.patient?.name || '',
          department: content.patient?.department || ''
        };
      } catch (e) {
        return { filename, error: '解析失敗' };
      }
    });

    // 將組員自訂長輩 (黃小姐) 置頂排列以方便做報告與展示
    list.sort((a, b) => {
      if (a.filename && a.filename.includes('huang-grandma')) return -1;
      if (b.filename && b.filename.includes('huang-grandma')) return 1;
      return 0;
    });

    res.json({ success: true, data: list });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/scenarios/:filename', (req, res) => {
  try {
    const filePath = path.join(SCENARIOS_DIR, req.params.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '找不到指定的情境檔案' });
    }
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json({ success: true, data: content });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/scenarios/load', async (req, res) => {
  try {
    const scenario = req.body;
    if (!scenario || !scenario.patient) {
      return res.status(400).json({ success: false, message: '情境格式不正確（缺少 patient 資料）！' });
    }

    const p = scenario.patient;

    // 1. 更新病患基本檔
    await dbQuery.run(`
      UPDATE patients SET
        name = ?,
        age = ?,
        gender = ?,
        care_category = ?,
        primary_hospital = ?,
        department = ?,
        doctor_name = ?,
        next_visit_date = ?
      WHERE id = 1
    `, [
      p.name || '王林秀美',
      p.age || 82,
      p.gender || '女',
      p.careCategory || '高齡慢性病照護追蹤',
      p.primaryHospital || '林口長庚紀念醫院',
      p.department || '心臟內科',
      p.doctorName || '林宏昌 主治醫師',
      p.visitDate || '2026-11-20'
    ]);

    // 2. 插入口頭醫囑
    if (scenario.verbalOrder) {
      const vo = scenario.verbalOrder;
      let conditionText = vo.conditionText;
      let actionText = vo.actionText;
      let redFlags = vo.redFlags;

      if (!conditionText || !actionText) {
        const orderRes = await VerbalOrderPipeline.parse(vo.rawInput);
        conditionText = orderRes.conditionText;
        actionText = orderRes.actionText;
        redFlags = orderRes.redFlags;
      }

      await dbQuery.run(`
        INSERT INTO verbal_orders (
          patient_id, department, doctor_name, raw_input, condition_text, action_text, red_flags, recorded_by
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
      `, [
        vo.department || p.department,
        p.doctorName,
        vo.rawInput,
        conditionText,
        actionText,
        redFlags,
        vo.recordedBy || '特助'
      ]);
    }

    // 4. 插入處方
    if (scenario.prescriptions) {
      if (scenario.prescriptions.previous && scenario.prescriptions.previous.length > 0) {
        await dbQuery.run(`
          INSERT INTO prescriptions (
            patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
          ) VALUES (1, ?, ?, '2026-10-15', 'previous', ?, '前期常規門診處方')
        `, [
          p.primaryHospital || '林口長庚紀念醫院',
          p.department || '心臟內科',
          JSON.stringify(scenario.prescriptions.previous)
        ]);
      }
      if (scenario.prescriptions.current && scenario.prescriptions.current.length > 0) {
        let analyzedMeds = scenario.prescriptions.current;
        let inferenceSummary = scenario.prescriptions.inferenceSummary;

        if (!inferenceSummary) {
          const rxRes = await PrescriptionMcpPipeline.inferAndAudit({
            newMedications: scenario.prescriptions.current,
            prevMedications: scenario.prescriptions.previous || [],
            hospitalName: p.primaryHospital,
            department: p.department
          });
          analyzedMeds = rxRes.analyzedMeds;
          inferenceSummary = rxRes.inferenceSummary;
        }

        await dbQuery.run(`
          INSERT INTO prescriptions (
            patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
          ) VALUES (1, ?, ?, ?, 'current', ?, ?)
        `, [
          p.primaryHospital || '林口長庚紀念醫院',
          p.department || '心臟內科',
          p.visitDate || new Date().toISOString().split('T')[0],
          JSON.stringify(analyzedMeds),
          inferenceSummary
        ]);
      }
    }

    // 5. 插入家庭備忘
    if (scenario.familyNotes && Array.isArray(scenario.familyNotes)) {
      for (const fn of scenario.familyNotes) {
        const author = fn.authorName || '家屬';
        const city = fn.authorLocation || '台北';
        const content = fn.noteText || '';
        await dbQuery.run(`
          INSERT INTO family_notes (patient_id, author, city, content, author_location, author_name, note_text, note_type)
          VALUES (1, ?, ?, ?, ?, ?, ?, ?)
        `, [
          author,
          city,
          content,
          city,
          author,
          content,
          fn.noteType || '日常叮嚀'
        ]);
      }
    }

    res.json({
      success: true,
      message: `情境「${scenario.title || p.name}」已成功載入！全系統資料已同步完成。`,
      data: scenario
    });
  } catch (error) {
    console.error('載入情境資料失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 1. 全家照護雲端看板模組 (Family Care Hub)
// ========================================================

// 清空示範資料（供組員登打自家長輩數據）
app.post('/api/demo/clear', async (req, res) => {
  try {
    await clearDemoData();
    res.json({ success: true, message: '已清空示範資料，現在可登打自家長輩數據！' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 恢復官方臨床示範資料
app.post('/api/demo/restore', async (req, res) => {
  try {
    await restoreDemoData();
    res.json({ success: true, message: '已恢復官方示範臨床案例！' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 編輯長輩基本檔案 (支援綁定 LINE 帳號與跨組員雲端持久化)
app.put('/api/patient', async (req, res) => {
  try {
    const { name, age, conditions, primary_hospital, updated_by, line_user_id } = req.body;
    await dbQuery.run(`
      UPDATE patients SET
        name = COALESCE(?, name),
        age = ?,
        conditions = COALESCE(?, conditions),
        primary_hospital = COALESCE(?, primary_hospital),
        updated_by = COALESCE(?, updated_by),
        line_user_id = COALESCE(?, line_user_id)
      WHERE id = 1
    `, [
      name || null,
      age ? parseInt(age) : null,
      conditions || null,
      primary_hospital || null,
      updated_by || '政大創創團隊 (LINE 綁定協同)',
      line_user_id || 'line_bound_team'
    ]);

    // 持久化至平台 JSON 檔案 (保證 Render 重啟或重新部署皆不遺失)
    saveCustomPatientData({
      id: 1,
      name: name || '黃小姐 (奶奶)',
      age: age ? parseInt(age) : 82,
      gender: '女',
      conditions: conditions || '原發性高血壓二期、退化性膝關節炎、心血管日常保養',
      primary_hospital: primary_hospital || '台北市立萬芳醫院 (政大生活圈首選)',
      updated_by: updated_by || '政大創創第八組 (LINE 綁定協同)',
      line_user_id: line_user_id || 'line_bound_team'
    });

    // 於全家看板自動同步推播廣播 (讓所有組員即時看見)
    if (name) {
      const author = updated_by || 'LINE 協同組員';
      await dbQuery.run(`
        INSERT INTO family_notes (patient_id, author, city, content)
        VALUES (1, ?, '雲端同步', ?)
      `, [
        author,
        `✨ 已將長輩設定為【${name}】${age ? ` (${age}歲)` : ''}，常就診醫院：${primary_hospital || '未指定'}。平台雲端已永久同步，組員做報告皆可共享使用！`
      ]);
    }

    const updated = await dbQuery.get("SELECT * FROM patients WHERE id = 1");
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 取得手足協同備忘
app.get('/api/family-notes', async (req, res) => {
  try {
    const notes = await dbQuery.all("SELECT * FROM family_notes WHERE patient_id = 1 ORDER BY id DESC LIMIT 20");
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/dashboard', async (req, res) => {
  try {
    const patient = await dbQuery.get("SELECT * FROM patients WHERE id = 1");
    const verbalOrders = await dbQuery.all("SELECT * FROM verbal_orders WHERE patient_id = 1 ORDER BY id DESC LIMIT 5");
    const prescriptions = await dbQuery.all("SELECT * FROM prescriptions WHERE patient_id = 1 ORDER BY id DESC LIMIT 5");
    const hubBookings = await dbQuery.all("SELECT * FROM hub_bookings WHERE patient_id = 1 ORDER BY id DESC LIMIT 5");
    const familyNotes = await dbQuery.all("SELECT * FROM family_notes WHERE patient_id = 1 ORDER BY id DESC LIMIT 10");

    const parsedPrescriptions = prescriptions.map(p => ({
      ...p,
      medications: JSON.parse(p.medications_json || '[]')
    }));

    res.json({
      success: true,
      data: {
        patient,
        latestOrder: verbalOrders[0] || null,
        currentPrescription: parsedPrescriptions[0] || null,
        verbalOrders,
        prescriptions: parsedPrescriptions,
        hubBookings,
        familyNotes
      }
    });
  } catch (error) {
    console.error('取得看板資料失敗:', error);
    res.status(500).json({ success: false, message: '資料庫讀取失敗' });
  }
});

// 手足雲端協同備忘
app.post('/api/family-notes', async (req, res) => {
  try {
    const { authorLocation, authorName, noteText, noteType } = req.body;
    if (!authorName || !noteText) {
      return res.status(400).json({ success: false, message: '請提供姓名與備忘內容！' });
    }

    // 透過專屬管道進行手足衛教轉譯
    const formatted = await FamilyCarePipeline.formatNoteForSiblings(authorName, noteText);

    const author = authorName;
    const city = authorLocation || '台北';
    const content = formatted.formattedSummary;

    const result = await dbQuery.run(`
      INSERT INTO family_notes (patient_id, author, city, content, author_location, author_name, note_text, note_type)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `, [
      author,
      city,
      content,
      city,
      author,
      content,
      noteType || '日常叮嚀'
    ]);

    res.status(201).json({
      success: true,
      message: '手足照護提醒已同步！',
      data: {
        id: result.lastID,
        authorLocation: authorLocation || '台北',
        authorName,
        noteText: formatted.formattedSummary,
        noteType: noteType || '日常叮嚀',
        telemetry: formatted.telemetry
      }
    });
  } catch (error) {
    console.error('新增家庭備忘失敗:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 2. 診後口頭醫囑轉譯模組 (Verbal Orders Digitization)
// ★ 專屬管道: VerbalOrderPipeline (6s 即時語音響應逾時防護)
// ========================================================
app.get('/api/verbal-orders', async (req, res) => {
  try {
    const orders = await dbQuery.all("SELECT * FROM verbal_orders ORDER BY id DESC");
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/verbal-orders/parse', async (req, res) => {
  try {
    const { rawInput, department, doctorName, recordedBy } = req.body;

    if (!rawInput) {
      return res.status(400).json({ success: false, message: '請提供口頭交代內容！' });
    }

    // 透過專屬功能管道 VerbalOrderPipeline 處理
    const aiOrder = await VerbalOrderPipeline.parse(rawInput);
    const conditionText = aiOrder.conditionText;
    const actionText = aiOrder.actionText;
    const redFlags = aiOrder.redFlags;

    const result = await dbQuery.run(`
      INSERT INTO verbal_orders (
        patient_id, department, doctor_name, raw_input, condition_text, action_text, red_flags, recorded_by
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?)
    `, [
      department || '心臟內科',
      doctorName || '林主治醫師',
      rawInput,
      conditionText,
      actionText,
      redFlags,
      recordedBy || '林口長庚 Hub 護理特助'
    ]);

    res.status(201).json({
      success: true,
      message: '口頭醫囑轉譯成功！已同步至家庭看板。',
      data: {
        id: result.lastID,
        rawInput,
        conditionText,
        actionText,
        redFlags,
        recordedBy: recordedBy || '林口長庚 Hub 護理特助',
        telemetry: aiOrder.telemetry
      }
    });
  } catch (error) {
    console.error('轉譯醫囑失敗:', error);
    res.status(500).json({ success: false, message: '轉譯醫囑失敗' });
  }
});

// ========================================================
// 4. 藥袋用法代碼逆向推導模組 (Prescription Inference Engine)
// ★ 專屬管道: PrescriptionMcpPipeline (對接 DrugBank MCP: 6s/15s 雙層防護)
// ========================================================
app.get('/api/prescriptions', async (req, res) => {
  try {
    const rxList = await dbQuery.all("SELECT * FROM prescriptions ORDER BY id DESC");
    const formatted = rxList.map(r => ({
      ...r,
      medications: JSON.parse(r.medications_json)
    }));
    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/prescriptions/infer', async (req, res) => {
  try {
    const { newMedications, hospitalName, department, prescriptionDate, bagImageUrl } = req.body;

    if (!newMedications || !Array.isArray(newMedications) || newMedications.length === 0) {
      return res.status(400).json({ success: false, message: '請提供有效的藥袋清單！' });
    }

    // 取得最新前期處方以進行比對
    const prevRxRecord = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'previous' OR period_type = 'current' ORDER BY id ASC LIMIT 1");
    let prevMeds = [];
    if (prevRxRecord) {
      try {
        prevMeds = JSON.parse(prevRxRecord.medications_json);
      } catch (e) {}
    }

    // 透過專屬 DrugBank MCP 增強管道進行逆向推導、DDI 比對與臨床審查
    const inferResult = await PrescriptionMcpPipeline.inferAndAudit({
      newMedications,
      prevMedications: prevMeds,
      hospitalName,
      department
    });

    const analyzedMeds = inferResult.analyzedMeds;
    const inferenceSummary = inferResult.inferenceSummary;
    const drugBankMcp = inferResult.drugBankMcp;
    const telemetry = inferResult.telemetry;

    await dbQuery.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, bag_image_url, medications_json, inference_summary
      ) VALUES (1, ?, ?, ?, 'current', ?, ?, ?)
    `, [
      hospitalName || '林口長庚紀念醫院',
      department || '心臟內科',
      prescriptionDate || new Date().toISOString().split('T')[0],
      bagImageUrl || null,
      JSON.stringify(analyzedMeds),
      inferenceSummary
    ]);

    res.json({
      success: true,
      message: '藥袋代碼推導與 DrugBank MCP 藥理審查完成！',
      data: {
        analyzedMeds,
        inferenceSummary,
        clinicalActions: inferResult.clinicalActions,
        drugBankMcp,
        telemetry,
        medicalCodesReference: MEDICAL_CODES
      }
    });
  } catch (error) {
    console.error('處方逆向推導出錯:', error);
    res.status(500).json({ success: false, message: '處方推導失敗: ' + error.message });
  }
});

// ========================================================
// 5. 在地醫院 Hub 陪診媒合模組 (Hospital Hub Bookings)
// ========================================================
app.get('/api/hub-bookings', async (req, res) => {
  try {
    const bookings = await dbQuery.all("SELECT * FROM hub_bookings ORDER BY id DESC");
    res.json({ success: true, data: bookings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/hub-bookings', async (req, res) => {
  try {
    const { hospitalName, department, visitDate, escortName } = req.body;
    if (!hospitalName || !department || !visitDate) {
      return res.status(400).json({ success: false, message: '請填寫完整派案資訊！' });
    }

    const result = await dbQuery.run(`
      INSERT INTO hub_bookings (patient_id, hospital_name, department, visit_date, escort_name, status)
      VALUES (1, ?, ?, ?, ?, '已配對護理特助')
    `, [hospitalName, department, visitDate, escortName || '林口長庚專案特助']);

    res.status(201).json({ success: true, message: '陪診特助已成功預約媒合！', id: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 6. 本機 Ollama 連線狀態查詢
// ========================================================
app.get('/api/ollama/status', async (req, res) => {
  try {
    const status = await checkOllamaConnection();
    res.json({ success: true, data: status });
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
      callbackUrl: process.env.LINE_CALLBACK_URL || defaultCallback,
      localtunnelUrl: 'https://carenav-demo.loca.lt'
    }
  });
});

// 發起 LINE 授權轉跳
app.get('/auth/line', (req, res) => {
  const channelId = process.env.LINE_CHANNEL_ID;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelId || !channelSecret) {
    // 尚未在 .env 填入 LINE 憑證時，重定向回前台並給予配置指引
    return res.redirect('/?auth_notice=line_config_needed');
  }

  const host = req.get('host');
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  const callbackUrl = process.env.LINE_CALLBACK_URL || `${protocol}://${host}/auth/line/callback`;
  const state = Math.random().toString(36).substring(2, 15);

  const authUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${channelId}&redirect_uri=${encodeURIComponent(callbackUrl)}&state=${state}&scope=profile%20openid`;
  res.redirect(authUrl);
});

// LINE 授權成功回呼端點 (Callback)
app.get('/auth/line/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;

  if (error) {
    console.warn('LINE 授權取消或失敗:', error, error_description);
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

    // 1. 向 LINE 換取 Access Token
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
      console.error('LINE Token 換取失敗:', tokenData);
      return res.redirect(`/?auth_error=${encodeURIComponent(tokenData.error_description || '換取 Token 失敗')}`);
    }

    // 2. 取得 LINE 個人檔案資訊 (姓名、頭像)
    const profileRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await profileRes.json();

    // 3. 儲存或更新至 SQLite users 表
    const existing = await dbQuery.get('SELECT id FROM users WHERE provider_id = ?', [profile.userId]);
    if (existing) {
      await dbQuery.run(
        'UPDATE users SET display_name = ?, picture_url = ? WHERE id = ?',
        [profile.displayName || 'LINE 用戶', profile.pictureUrl || null, existing.id]
      );
    } else {
      await dbQuery.run(
        'INSERT INTO users (provider, provider_id, display_name, picture_url, family_role) VALUES (\'line\', ?, ?, ?, \'家屬\')',
        [profile.userId, profile.displayName || 'LINE 用戶', profile.pictureUrl || null]
      );
    }

    // 4. 重導向回前台，帶入身分資訊並完成登入
    res.redirect(`/?line_login=success&name=${encodeURIComponent(profile.displayName || 'LINE 家屬')}&pic=${encodeURIComponent(profile.pictureUrl || '')}&uid=${encodeURIComponent(profile.userId)}`);
  } catch (err) {
    console.error('LINE Callback 處理異常:', err);
    res.redirect(`/?auth_error=${encodeURIComponent(err.message)}`);
  }
});

// 模擬快速登入 (方便開發與尚未取得 LINE Developers 審核時測試)
app.post('/api/auth/mock-login', async (req, res) => {
  const { roleName, location } = req.body;
  const mockUser = {
    displayName: roleName || 'Alice 大女兒 (台北)',
    pictureUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=120&h=120&fit=crop&crop=face',
    userId: 'mock_line_' + Date.now(),
    location: location || '台北'
  };

  const existing = await dbQuery.get('SELECT id FROM users WHERE provider_id = ?', [mockUser.userId]);
  if (!existing) {
    await dbQuery.run(
      'INSERT INTO users (provider, provider_id, display_name, picture_url, family_role) VALUES (\'mock_line\', ?, ?, ?, ?)',
      [mockUser.userId, mockUser.displayName, mockUser.pictureUrl, mockUser.location]
    );
  }

  res.json({ success: true, data: mockUser });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 CareNav 智護領航 - 核心伺服器運行中！`);
  console.log(`⚡ 雙 LLM 呼叫管道就緒：`);
  console.log(`   ├─ 管道 A [本地極速推理]：直連本機 Ollama (${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'})`);
  console.log(`   └─ 管道 B [臨床藥學 MCP]：直連 DrugBank MCP (${process.env.DRUGBANK_MCP_URL || 'https://mcp.drugbank.com/mcp'})`);
  console.log(`🛡️ 專屬功能隔離通道：GuidePipeline | VerbalOrderPipeline | PrescriptionMcpPipeline | FamilyCarePipeline`);
  console.log(`🌐 系統前台網址： http://localhost:${PORT}`);
  console.log(`====================================================`);
});
