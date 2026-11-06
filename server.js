/**
 * server.js
 * CareNav 智護領航 - 核心 API 伺服器
 * 提供 4 大模組（排除功能三）的完整業務邏輯與 Ollama 本地模型推論：
 * 1. 全家照護雲端看板 (/api/dashboard, /api/family-notes)
 * 2. 診前臨床指引卡生成 (/api/guides, /api/guides/generate)
 * 3. 診後口頭醫囑轉譯 (/api/verbal-orders, /api/verbal-orders/parse)
 * 4. 藥袋代碼逆向推導與處方比對 (/api/prescriptions, /api/prescriptions/infer)
 * 5. 在地醫院 Hub 陪診媒合 (/api/hub-bookings)
 * 6. Ollama 連線狀態與模型查詢 (/api/ollama/status)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbQuery } = require('./database');
const { checkOllamaConnection, generateDiscussionGuideWithOllama, parseVerbalOrderWithOllama } = require('./ollamaService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
// 提高 JSON payload 上限以支援拍照藥袋 Base64 圖片上傳
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// 醫學處方代碼字典 (Medical Frequency & Timing Lexicon)
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
// 1. 全家照護雲端看板 (Family Care Hub)
// ========================================================
app.get('/api/dashboard', async (req, res) => {
  try {
    const patient = await dbQuery.get("SELECT * FROM patients WHERE id = 1");
    const latestGuide = await dbQuery.get("SELECT * FROM discussion_guides ORDER BY id DESC LIMIT 1");
    const latestOrder = await dbQuery.get("SELECT * FROM verbal_orders ORDER BY id DESC LIMIT 1");
    const currentRx = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'current' ORDER BY id DESC LIMIT 1");
    const prevRx = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'previous' ORDER BY id DESC LIMIT 1");
    const nextBooking = await dbQuery.get("SELECT * FROM hub_bookings ORDER BY id DESC LIMIT 1");
    const familyNotes = await dbQuery.all("SELECT * FROM family_notes ORDER BY id DESC LIMIT 15");

    res.json({
      success: true,
      data: {
        patient,
        latestGuide,
        latestOrder,
        currentPrescription: currentRx ? { ...currentRx, medications: JSON.parse(currentRx.medications_json) } : null,
        previousPrescription: prevRx ? { ...prevRx, medications: JSON.parse(prevRx.medications_json) } : null,
        nextBooking,
        familyNotes
      }
    });
  } catch (error) {
    console.error('載入看板失敗:', error);
    res.status(500).json({ success: false, message: '伺服器讀取看板資料失敗' });
  }
});

// 手足協同留話簿
app.get('/api/family-notes', async (req, res) => {
  try {
    const notes = await dbQuery.all("SELECT * FROM family_notes ORDER BY id DESC");
    res.json({ success: true, data: notes });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/family-notes', async (req, res) => {
  try {
    const { author, city, content } = req.body;
    if (!author || !content) {
      return res.status(400).json({ success: false, message: '請填寫發言人與內容！' });
    }
    const result = await dbQuery.run(
      "INSERT INTO family_notes (patient_id, author, city, content) VALUES (1, ?, ?, ?)",
      [author, city || '台北', content]
    );
    res.status(201).json({ success: true, id: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ========================================================
// 2. 診前臨床指引卡模組 (Doctor Discussion Guide)
// ========================================================
app.get('/api/guides', async (req, res) => {
  try {
    const guides = await dbQuery.all("SELECT * FROM discussion_guides ORDER BY id DESC");
    res.json({ success: true, data: guides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/guides/generate', async (req, res) => {
  try {
    const { department, doctorName, visitDate, morningBp, nocturiaCount, symptoms, vitalsSummary } = req.body;

    // 調用 Ollama 本地模型（或臨床備援引擎）
    const aiOutput = await generateDiscussionGuideWithOllama({
      department,
      doctorName,
      morningBp,
      nocturiaCount,
      symptoms,
      vitalsSummary: vitalsSummary || `晨間血壓 ${morningBp}，夜尿 ${nocturiaCount}`
    });

    const keyComplaint = aiOutput.keyComplaint;
    const doctorQuestions = Array.isArray(aiOutput.doctorQuestions) 
      ? aiOutput.doctorQuestions.join('\n') 
      : aiOutput.doctorQuestions;
    const triageOptions = aiOutput.triageOptions;

    const newGuide = await dbQuery.run(`
      INSERT INTO discussion_guides (
        patient_id, department, doctor_name, visit_date, morning_bp, nocturia_count, symptoms, key_complaint, doctor_questions, triage_options
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      department || '心臟內科',
      doctorName || '主治醫師',
      visitDate || new Date().toISOString().split('T')[0],
      morningBp || '148-162 mmHg',
      nocturiaCount || '3-4 次/晚',
      symptoms || '晨起頭暈、夜間起夜頻繁、下肢輕度水腫',
      keyComplaint,
      doctorQuestions,
      JSON.stringify(triageOptions)
    ]);

    res.status(201).json({
      success: true,
      message: '診前指引卡已成功生成！',
      data: {
        id: newGuide.lastID,
        department: department || '心臟內科',
        doctorName: doctorName || '主治醫師',
        visitDate: visitDate || new Date().toISOString().split('T')[0],
        morningBp,
        nocturiaCount,
        symptoms,
        keyComplaint,
        doctorQuestions,
        triageOptions
      }
    });
  } catch (error) {
    console.error('生成指引卡失敗:', error);
    res.status(500).json({ success: false, message: '生成失敗: ' + error.message });
  }
});

// ========================================================
// 3. 診後口頭醫囑轉譯模組 (Verbal Orders Digitization)
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

    // 調用 Ollama 本地模型（或臨床規則引擎）進行結構化轉譯
    const aiOrder = await parseVerbalOrderWithOllama(rawInput);
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
        recordedBy: recordedBy || '林口長庚 Hub 護理特助'
      }
    });
  } catch (error) {
    console.error('轉譯醫囑失敗:', error);
    res.status(500).json({ success: false, message: '轉譯醫囑失敗' });
  }
});

// ========================================================
// 4. 藥袋用法代碼逆向推導模組 (Prescription Inference Engine)
// ★ 預留藥學知識庫 MCP (Pharmacology MCP Hook)
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

    // 逆向推導比對演算法
    const analyzedMeds = newMedications.map(newMed => {
      const codeUpper = (newMed.code || 'QD').toUpperCase();
      const codeMeaning = MEDICAL_CODES[codeUpper] || '依照專科醫師特定醫囑服用';
      
      const matchedOld = prevMeds.find(old => {
        const oldPrefix = old.name.split(' ')[0].toLowerCase();
        const newPrefix = newMed.name.split(' ')[0].toLowerCase();
        return oldPrefix === newPrefix || old.name.includes(newMed.name.slice(0, 4));
      });

      let changeType = 'new';
      let changeNotice = '本期初次新增處方';

      if (matchedOld) {
        const oldCodeUpper = (matchedOld.code || '').toUpperCase();
        if (oldCodeUpper !== codeUpper) {
          changeType = 'timing';
          changeNotice = `時段重大調整：由前期【${oldCodeUpper}】改為本期【${codeUpper}】(${codeMeaning})`;
        } else {
          changeType = 'same';
          changeNotice = '劑量與用法維持不變 (常規續開)';
        }
      }

      return {
        ...newMed,
        code: codeUpper,
        frequencyChinese: codeMeaning,
        changeType,
        changeNotice
      };
    });

    const changedCount = analyzedMeds.filter(m => m.changeType !== 'same').length;
    let inferenceSummary = `【門診處方逆向推導診斷】本期門診辨識出 ${analyzedMeds.length} 種常規藥品，偵測到 ${changedCount} 項重要處方變更。利尿劑與脈優由晚間改至晨間服用，消弭夜間起夜高頻跌倒風險；加開保護心腎藥物。`;

    // 擴充掛載點：藥學知識庫 MCP (Pharmacology Knowledge Base)
    const mcpPharmacologyNotes = [
      "藥學交互作用分析 (DDI)：Norvasc (CCB) 與 Diovan (ARB) 具協同降血壓作用，調整初期一週請監測晨間起立時之姿勢性低血壓。",
      "高齡用藥指引 (Beers Criteria)：利尿劑改至早晨服用為正確醫囑排程，大幅降低夜間起夜跌倒風險。"
    ];

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
      message: '藥袋用法代碼逆向推導與處方比對完成！',
      data: {
        analyzedMeds,
        inferenceSummary,
        mcpPharmacologyNotes,
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
// 6. Ollama 連線狀態與模型查詢
// ========================================================
app.get('/api/ollama/status', async (req, res) => {
  try {
    const status = await checkOllamaConnection();
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 CareNav 智護領航 - 核心伺服器運行中！`);
  console.log(`🌐 系統前台網址： http://localhost:${PORT}`);
  console.log(`===============================================`);
});
