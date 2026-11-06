/**
 * database.js
 * CareNav 智護領航 - 核心資料庫模組 (SQLite)
 * 負責持久化長輩照護紀錄、診前指引卡、口頭醫囑、新舊藥袋處方與醫院Hub媒合
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'data.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('❌ 無法連線至 SQLite 資料庫:', err.message);
  } else {
    console.log('✅ CareNav 資料庫已連線:', DB_PATH);
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    // 1. 長輩個案表 (Patients)
    db.run(`
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age INTEGER,
        gender TEXT,
        conditions TEXT,
        primary_hospital TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. 診前臨床指引卡 (Doctor Discussion Guides)
    db.run(`
      CREATE TABLE IF NOT EXISTS discussion_guides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        department TEXT NOT NULL,
        doctor_name TEXT,
        visit_date TEXT,
        vitals_summary TEXT,
        symptoms TEXT,
        key_complaint TEXT,
        doctor_questions TEXT,
        triage_options TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. 診後口頭醫囑轉譯表 (Verbal Orders)
    db.run(`
      CREATE TABLE IF NOT EXISTS verbal_orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        department TEXT,
        doctor_name TEXT,
        raw_input TEXT NOT NULL,
        condition_text TEXT,
        action_text TEXT,
        red_flags TEXT,
        recorded_by TEXT DEFAULT '特助/家屬',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. 藥袋處方與逆向推導表 (Prescriptions)
    db.run(`
      CREATE TABLE IF NOT EXISTS prescriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        hospital_name TEXT,
        department TEXT,
        prescription_date TEXT,
        period_type TEXT, -- 'previous' 前期 或 'current' 本期
        medications_json TEXT NOT NULL,
        inference_summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. 在地醫院 Hub 陪診派案表 (Hospital Hub Bookings)
    db.run(`
      CREATE TABLE IF NOT EXISTS hub_bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        hospital_name TEXT NOT NULL,
        department TEXT NOT NULL,
        visit_date TEXT NOT NULL,
        escort_name TEXT,
        status TEXT DEFAULT '已配對護理特助',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      seedInitialData();
    });
  });
}

// 預載展示示範資料（讓使用者與評審一開啟網頁就能體驗完整流程）
function seedInitialData() {
  db.get("SELECT COUNT(*) as count FROM patients", [], (err, row) => {
    if (err || row.count > 0) return;

    console.log("🌱 正在注入 CareNav 示範臨床數據...");

    // 注入預設長輩個案
    db.run(`
      INSERT INTO patients (id, name, age, gender, conditions, primary_hospital)
      VALUES (1, '陳國華 (爸爸)', 72, '男', '高血壓第二期、慢性腎臟病第3期、夜尿症', '林口長庚紀念醫院')
    `);

    // 注入示範診前指引卡 (心臟內科)
    db.run(`
      INSERT INTO discussion_guides (
        patient_id, department, doctor_name, visit_date, vitals_summary, symptoms, key_complaint, doctor_questions, triage_options
      ) VALUES (
        1, '心臟內科', '林主治醫師', '2026-11-12',
        '近兩週清晨收縮壓平均 148-162 mmHg，夜尿次數由每晚 1 次增加為 3-4 次，輕微雙腳下肢水腫。',
        '晨起頭暈、夜間頻繁起夜影響睡眠',
        '血壓近兩週晨間反覆升高且夜尿增加，疑似現有降壓藥物晨間保護力不足。',
        '1. 是否需調整利尿劑投藥時間或換為長效型？\n2. 鈣離子阻斷劑 (脈優) 是否需改至早晨服用？',
        '["原處方續開", "調整脈優服藥時段至晨間 (QD AM)", "利尿劑減半並加抽腎功能指數", "安排兩週後心臟超音波複查"]'
      )
    `);

    // 注入示範口頭醫囑轉譯
    db.run(`
      INSERT INTO verbal_orders (
        patient_id, department, doctor_name, raw_input, condition_text, action_text, red_flags, recorded_by
      ) VALUES (
        1, '心臟內科', '林主治醫師',
        '如果早上量血壓收縮壓低於 110，那顆脈優 5mg 先停吃一次。利尿劑換到早上吃避免夜尿，若下肢水腫三天沒消要提早回來。',
        '晨間血壓 < 110 mmHg，或心率 < 55 bpm',
        '暫停當天早晨的「脈優 (Norvasc 5mg)」，其餘常規用藥照常服用。利尿劑改為早餐後服用。',
        '下肢水腫無改善、連續兩天清晨血壓高於 170 mmHg、或出現呼吸急促時需立即回診。',
        '長庚林口 Hub 護理特助 - 王思婷'
      )
    `);

    // 注入前期藥袋處方 (Previous)
    const prevMeds = [
      { name: "Norvasc 脈優錠 5mg", code: "QD HS", frequency: "每日睡前一次", indication: "高血壓", note: "維持" },
      { name: "Lasix 歐得通/利尿劑 40mg", code: "QD HS", frequency: "每日睡前一次", indication: "水腫/心衰", note: "導致嚴重夜尿" },
      { name: "Crestor 冠脂妥 10mg", code: "QD HS", frequency: "每日睡前一次", indication: "高血脂", note: "維持" }
    ];
    db.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
      ) VALUES (
        1, '林口長庚紀念醫院', '心臟內科', '2026-10-15', 'previous',
        ?, '前期心臟內科常規處方，利尿劑排於睡前服用造成夜尿頻繁。'
      )
    `, [JSON.stringify(prevMeds)]);

    // 注入本期最新處方 (Current) - 呈現逆向推導的處方異動
    const currentMeds = [
      { name: "Norvasc 脈優錠 5mg", code: "QD AM", frequency: "每日早晨一次", indication: "高血壓", change: "服藥時段變更 (由 HS 改為 AM)" },
      { name: "Lasix 歐得通/利尿劑 40mg", code: "QD AM", frequency: "每日早晨一次", indication: "水腫/心衰", change: "服藥時段變更 (改至晨間，解決夜尿)" },
      { name: "Diovan 得安穩 80mg", code: "QD HS", frequency: "每日睡前一次", indication: "高血壓保護腎臟", change: "本期新增藥物" },
      { name: "Crestor 冠脂妥 10mg", code: "QD HS", frequency: "每日睡前一次", indication: "高血脂", change: "劑量不變" }
    ];
    db.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
      ) VALUES (
        1, '林口長庚紀念醫院', '心臟內科', '2026-11-05', 'current',
        ?, '【逆向推導分析結果】本期門診將利尿劑與脈優從睡前改至早晨服用，成功規避夜間頻繁起床跌倒風險；新增得安穩保護心腎。'
      )
    `, [JSON.stringify(currentMeds)]);

    // 注入示範醫院 Hub 陪診派案
    db.run(`
      INSERT INTO hub_bookings (
        patient_id, hospital_name, department, visit_date, escort_name, status
      ) VALUES (
        1, '林口長庚紀念醫院', '新陳代謝科', '2026-11-20 (週五 09:30)', '林口 Hub 特助 - 陳雅琪 (專科護理師)', '已排程就醫錨定'
      )
    `);

    console.log("✅ CareNav 示範臨床數據已注入完成！");
  });
}

// Promise 包裝查詢函式
const dbQuery = {
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      err ? reject(err) : resolve({ lastID: this.lastID, changes: this.changes });
    });
  })
};

module.exports = {
  db,
  dbQuery
};
