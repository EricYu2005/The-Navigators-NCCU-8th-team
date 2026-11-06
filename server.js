/**
 * server.js
 * CareNav 智護領航 - 後端核心伺服器
 * 提供：
 * 1. 全家照護雲端看板聚合 API (/api/dashboard)
 * 2. 診前臨床指引卡生成 API (/api/guides)
 * 3. 診後口頭醫囑轉譯 API (/api/verbal-orders)
 * 4. 藥袋代碼逆向推導與處方比對 API (/api/prescriptions/infer)
 * 5. 在地醫院 Hub 陪診媒合 API (/api/hub-bookings)
 * 
 * ★ 預留【藥學知識庫 MCP】擴充接口 (Pharmacology Knowledge Base Interface)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { dbQuery } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ========================================================
// 💊 醫學處方代碼字典 (Medical Frequency & Timing Lexicon)
// 後續可由「藥學知識庫 MCP」動態接管升級
// ========================================================
const MEDICAL_CODES = {
  'QD': '每日一次 (每天固定時間)',
  'QD AM': '每日一次 (早晨服用)',
  'QD PM': '每日一次 (傍晚服用)',
  'QD HS': '每日一次 (睡前服用)',
  'BID': '每日兩次 (早晚服用)',
  'TID': '每日三次 (早中晚服用)',
  'QID': '每日四次 (早中晚及睡前)',
  'QOD': '每隔一日服用一次',
  'Q4H': '每 4 小時服用一次',
  'Q6H': '每 6 小時服用一次',
  'AC': '飯前服用 (通常為餐前半小時)',
  'PC': '飯後服用 (通常為餐後半小時)',
  'PRN': '需要時才服用 (有症狀時)',
  'STAT': '立即服用一次'
};

// ========================================================
// 1. 全家照護雲端看板 (Family Care Hub) 聚合資訊
// ========================================================
app.get('/api/dashboard', async (req, res) => {
  try {
    const patient = await dbQuery.get("SELECT * FROM patients WHERE id = 1");
    const latestGuide = await dbQuery.get("SELECT * FROM discussion_guides ORDER BY id DESC LIMIT 1");
    const latestOrder = await dbQuery.get("SELECT * FROM verbal_orders ORDER BY id DESC LIMIT 1");
    const currentRx = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'current' ORDER BY id DESC LIMIT 1");
    const prevRx = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'previous' ORDER BY id DESC LIMIT 1");
    const nextBooking = await dbQuery.get("SELECT * FROM hub_bookings ORDER BY id DESC LIMIT 1");

    res.json({
      success: true,
      data: {
        patient,
        latestGuide,
        latestOrder,
        currentPrescription: currentRx ? { ...currentRx, medications: JSON.parse(currentRx.medications_json) } : null,
        previousPrescription: prevRx ? { ...prevRx, medications: JSON.parse(prevRx.medications_json) } : null,
        nextBooking
      }
    });
  } catch (error) {
    console.error('載入看板失敗:', error);
    res.status(500).json({ success: false, message: '伺服器讀取看板資料失敗' });
  }
});

// ========================================================
// 2. 診前臨床指引卡模組 (Doctor Discussion Guide)
// ========================================================
// 取得所有指引卡紀錄
app.get('/api/guides', async (req, res) => {
  try {
    const guides = await dbQuery.all("SELECT * FROM discussion_guides ORDER BY id DESC");
    res.json({ success: true, data: guides });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// AI/規則引擎：自動生成診前 20 秒醫師快讀指引卡 + 5秒勾選回條
app.post('/api/guides/generate', async (req, res) => {
  try {
    const { department, doctorName, visitDate, vitalsSummary, symptoms } = req.body;

    if (!department || !vitalsSummary) {
      return res.status(400).json({ success: false, message: '請提供科別與近況數值摘要！' });
    }

    // 核心邏輯：將長輩口語碎狀生活數據，轉譯為符合臨床溝通焦點的結構化資訊
    let keyComplaint = `患者主訴【${symptoms || '常規回診追蹤'}】。近期生理特徵警示：${vitalsSummary}`;
    let doctorQuestions = [];
    let triageOptions = [];

    if (department.includes('心臟') || vitalsSummary.includes('血壓') || symptoms.includes('水腫')) {
      doctorQuestions = [
        "1. 晨間收縮壓持續超過 140 mmHg，現有降壓藥是否需調整劑量或改換為長效型？",
        "2. 下肢水腫與夜尿頻率增加，利尿劑投藥時間是否建議由晚間移至晨間？",
        "3. 是否需安排常規血液生化抽血 (BUN / Cr / eGFR) 評估腎臟負擔？"
      ];
      triageOptions = [
        "【維持原方】續開三個月慢性病連續處方箋",
        "【時段調整】將脈優/利尿劑調整至早晨服用 (QD AM)",
        "【處方加開】加開保護心腎之血管張力素受體阻斷劑 (ARB)",
        "【門診安排】兩週後回診並複查心臟超音波與電解質"
      ];
    } else if (department.includes('新陳代謝') || symptoms.includes('血糖')) {
      doctorQuestions = [
        "1. 飯前/飯後血糖波動超過 60 mg/dL，現行降血糖藥物配比是否需調整？",
        "2. 是否評估加入每週一次腸泌素 (GLP-1 RA) 以保護心血管？"
      ];
      triageOptions = [
        "維持現有胰島素/口服藥劑量",
        "調整二甲雙胍 (Metformin) 服藥時機為隨餐服用",
        "安排糖化血色素 (HbA1c) 檢驗"
      ];
    } else {
      doctorQuestions = [
        "1. 目前症狀是否與長輩長期多重用藥之交互作用相關？",
        "2. 後續追蹤觀察週期與居家警訊指標應如何設定？"
      ];
      triageOptions = [
        "續開原藥物三個月",
        "減少非必要止痛/胃藥以減輕肝腎代謝",
        "安排進一步影像學檢查"
      ];
    }

    const newGuide = await dbQuery.run(`
      INSERT INTO discussion_guides (
        patient_id, department, doctor_name, visit_date, vitals_summary, symptoms, key_complaint, doctor_questions, triage_options
      ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      department,
      doctorName || '主治醫師',
      visitDate || new Date().toISOString().split('T')[0],
      vitalsSummary,
      symptoms,
      keyComplaint,
      doctorQuestions.join('\n'),
      JSON.stringify(triageOptions)
    ]);

    res.status(201).json({
      success: true,
      message: '診前指引卡已成功生成！',
      data: {
        id: newGuide.lastID,
        department,
        doctorName,
        visitDate,
        keyComplaint,
        doctorQuestions: doctorQuestions.join('\n'),
        triageOptions
      }
    });
  } catch (error) {
    console.error('生成指引卡失敗:', error);
    res.status(500).json({ success: false, message: '生成失敗' });
  }
});

// ========================================================
// 3. 診後口頭醫囑轉譯模組 (Verbal Orders Digitization)
// ========================================================
// 取得口頭醫囑歷史紀錄
app.get('/api/verbal-orders', async (req, res) => {
  try {
    const orders = await dbQuery.all("SELECT * FROM verbal_orders ORDER BY id DESC");
    res.json({ success: true, data: orders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 轉譯口頭醫囑：將口語或簡短醫囑轉換為結構化【條件-行動-紅旗警訊】
app.post('/api/verbal-orders/parse', async (req, res) => {
  try {
    const { rawInput, department, doctorName, recordedBy } = req.body;

    if (!rawInput) {
      return res.status(400).json({ success: false, message: '請輸入或錄製醫師口頭醫囑！' });
    }

    // 臨床轉譯引擎 (Clinical Rule & NLP Parser)
    let conditionText = "常規監測：晨間起床後量測一次血壓與脈搏";
    let actionText = "按時服用常規藥物，勿隨意自行停藥或增減劑量。";
    let redFlags = "若出現胸悶劇痛、肢體無力、單側麻痺或意識混亂，請立即撥打 119 送醫。";

    if (rawInput.includes('110') || rawInput.includes('低於') || rawInput.includes('停')) {
      conditionText = "【血壓觸發條件】清晨量測收縮壓 < 110 mmHg，或感到頭暈眼前發黑時。";
      actionText = "【停藥行動】當天早晨的「降血壓藥 (如脈優)」先暫停一次，其餘非降壓藥物（如胃藥、維他命）照常服用。";
      redFlags = "【危急警訊】若停藥後下午血壓仍低於 95 mmHg，或心率小於 50 bpm，請立即致電特助或就醫。";
    } else if (rawInput.includes('水腫') || rawInput.includes('尿') || rawInput.includes('利尿')) {
      conditionText = "【體液代謝觀察】雙下肢脛骨前緣壓下有凹陷性水腫，或夜間起夜 > 2 次。";
      actionText = "【服藥時段調整】利尿劑一律改至早餐後 30 分鐘內服用，嚴禁於下午 4 點後或睡前服用，避免夜尿造成跌倒。";
      redFlags = "【危急警訊】三天內體重快速增加超過 2 公斤、或夜間平躺感覺呼吸困難需墊高枕頭時，需提早回診。";
    } else if (rawInput.includes('飯前') || rawInput.includes('血糖') || rawInput.includes('低血糖')) {
      conditionText = "【血糖觸發條件】血糖值低於 70 mg/dL，或出現冒冷汗、手抖、心悸。";
      actionText = "【低血糖急救行動】立即飲用 120-150cc 含糖飲料或吃 3 顆方糖，15 分鐘後複測血糖。暫停下一次短效降糖藥。";
      redFlags = "【危急警訊】服糖 15 分鐘後意識仍不清醒或無法吞嚥，請立刻送急診。";
    }

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
      recordedBy || '護理特助'
    ]);

    res.status(201).json({
      success: true,
      message: '口頭醫囑已成功轉譯並推播至家庭看板！',
      data: {
        id: result.lastID,
        rawInput,
        conditionText,
        actionText,
        redFlags
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

// 逆向推導：比對前期藥袋與本期新藥袋
app.post('/api/prescriptions/infer', async (req, res) => {
  try {
    const { newMedications, hospitalName, department, prescriptionDate } = req.body;

    if (!newMedications || !Array.isArray(newMedications) || newMedications.length === 0) {
      return res.status(400).json({ success: false, message: '請提供有效的藥袋清單！' });
    }

    // 1. 取得最新的一筆前期藥袋 (Previous)
    const prevRxRecord = await dbQuery.get("SELECT * FROM prescriptions WHERE period_type = 'current' OR period_type = 'previous' ORDER BY id DESC LIMIT 1");
    let prevMeds = [];
    if (prevRxRecord) {
      try {
        prevMeds = JSON.parse(prevRxRecord.medications_json);
      } catch (e) {}
    }

    // 2. 醫學頻率代碼逆向解析與新舊比對
    const analyzedMeds = newMedications.map(newMed => {
      // 解析用法代碼
      const codeMeaning = MEDICAL_CODES[newMed.code.toUpperCase()] || '依照醫師特定醫囑服用';
      
      // 比對舊處方
      const matchedOld = prevMeds.find(old => old.name.toLowerCase().includes(newMed.name.slice(0, 4).toLowerCase()));

      let change = '新開立藥物 (初次使用)';
      if (matchedOld) {
        if (matchedOld.code.toUpperCase() !== newMed.code.toUpperCase()) {
          change = `時段重大調整：由舊處方的【${matchedOld.code}】改為本期的【${newMed.code}】`;
        } else {
          change = '劑量與用法維持不變 (常規續開)';
        }
      }

      return {
        ...newMed,
        frequencyChinese: codeMeaning,
        changeNotice: change
      };
    });

    // 3. 生成白話總結 (Inference Summary)
    const changedCount = analyzedMeds.filter(m => m.changeNotice.includes('調整') || m.changeNotice.includes('新開立')).length;
    let inferenceSummary = `【處方逆向推導完成】本期門診共辨識出 ${analyzedMeds.length} 種常規藥品。其中有 ${changedCount} 項重要處方異動。`;

    // ========================================================
    // ★ 擴充掛載點：藥學知識庫 MCP (Pharmacology Knowledge Base)
    // 當使用者提供藥學 MCP 時，在此處呼叫 MCP 工具進行藥物交互作用、
    // 重複用藥、與老人高風險用藥 (Beers Criteria) 檢查。
    // ========================================================
    const mcpPharmacologyNotes = [
      "💡 [藥學知識庫警示] Norvasc 與 Diovan 具協同降血壓作用，初次調整時段首週請每日定時記錄晨起血壓。",
      "💡 [高齡用藥指引] 利尿劑調整至晨間服用，有助顯著降低夜間起夜跌倒風險 (跌倒預防指引第4條)。"
    ];

    // 將新推導的處方寫入資料庫
    await dbQuery.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
      ) VALUES (1, ?, ?, ?, 'current', ?, ?)
    `, [
      hospitalName || '林口長庚紀念醫院',
      department || '心臟內科',
      prescriptionDate || new Date().toISOString().split('T')[0],
      JSON.stringify(analyzedMeds),
      inferenceSummary
    ]);

    res.json({
      success: true,
      message: '藥袋代碼推導與處方比對完成！',
      data: {
        analyzedMeds,
        inferenceSummary,
        mcpPharmacologyNotes,
        medicalCodesReference: MEDICAL_CODES
      }
    });
  } catch (error) {
    console.error('處方逆向推導出錯:', error);
    res.status(500).json({ success: false, message: '處方推導失敗' });
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
      VALUES (1, ?, ?, ?, ?, '已指派在地護理特助')
    `, [hospitalName, department, visitDate, escortName || '在地 Hub 特助派員中']);

    res.status(201).json({ success: true, message: '陪診特助已成功預約媒合！', id: result.lastID });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 啟動伺服器
app.listen(PORT, () => {
  console.log(`===============================================`);
  console.log(`🚀 CareNav 智護領航 - 核心原型伺服器運行中！`);
  console.log(`🌐 請開啟瀏覽器： http://localhost:${PORT}`);
  console.log(`===============================================`);
});
