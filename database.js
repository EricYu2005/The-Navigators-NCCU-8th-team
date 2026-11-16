/**
 * database.js
 * CareNav 智護領航 - 核心資料庫模組 (SQLite)
 * 負責持久化長輩照護紀錄、診前指引卡、口頭醫囑、新舊藥袋處方與全家協同歷程
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

    // 2. 診前臨床指引卡 (Doctor Discussion Guides / 專案護理師提問卡)
    db.run(`
      CREATE TABLE IF NOT EXISTS discussion_guides (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER,
        department TEXT NOT NULL,
        doctor_name TEXT,
        visit_date TEXT,
        morning_bp TEXT,
        nocturia_count TEXT,
        symptoms TEXT,
        key_complaint TEXT,
        doctor_questions TEXT,
        triage_options TEXT,
        nurse_name TEXT,
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
        bag_image_url TEXT,
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
    `);

    // 6. 全家照護協同留話簿 (Family Notes)
    db.run(`
      CREATE TABLE IF NOT EXISTS family_notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        patient_id INTEGER DEFAULT 1,
        author TEXT NOT NULL,
        city TEXT NOT NULL,
        content TEXT NOT NULL,
        author_location TEXT,
        author_name TEXT,
        note_text TEXT,
        note_type TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 7. 使用者帳號與第三方登入表 (Users)
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT DEFAULT 'line',
        provider_id TEXT UNIQUE,
        display_name TEXT NOT NULL,
        picture_url TEXT,
        family_role TEXT DEFAULT '家屬',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      // 安全欄位補齊遷移 (確保舊版 SQLite 自動升級)
      const safeAddColumns = [
        { table: 'patients', col: 'care_category TEXT' },
        { table: 'patients', col: 'department TEXT' },
        { table: 'patients', col: 'doctor_name TEXT' },
        { table: 'patients', col: 'next_visit_date TEXT' },
        { table: 'discussion_guides', col: 'morning_bp TEXT' },
        { table: 'discussion_guides', col: 'nocturia_count TEXT' },
        { table: 'discussion_guides', col: 'symptoms TEXT' },
        { table: 'discussion_guides', col: 'nurse_name TEXT' },
        { table: 'prescriptions', col: 'bag_image_url TEXT' },
        { table: 'family_notes', col: 'author_location TEXT' },
        { table: 'family_notes', col: 'author_name TEXT' },
        { table: 'family_notes', col: 'note_text TEXT' },
        { table: 'family_notes', col: 'note_type TEXT' },
        { table: 'patients', col: 'updated_by TEXT' },
        { table: 'patients', col: 'line_user_id TEXT' }
      ];
      safeAddColumns.forEach(item => {
        db.run(`ALTER TABLE ${item.table} ADD COLUMN ${item.col}`, () => {});
      });

      seedInitialData();
    });
  });
}

function seedInitialData() {
  db.get("SELECT COUNT(*) as count FROM patients", [], (err, row) => {
    if (err || (row && row.count > 0)) return;
    injectDemoData();
  });
}

function injectDemoData(callback) {
  console.log("🌱 正在注入 CareNav 專業示範臨床數據 (陳國華先生案例)...");
  db.serialize(() => {
    db.run("DELETE FROM verbal_orders WHERE patient_id = 1");
    db.run("DELETE FROM prescriptions WHERE patient_id = 1");
    db.run("DELETE FROM discussion_guides WHERE patient_id = 1");
    db.run("DELETE FROM hub_bookings WHERE patient_id = 1");
    db.run("DELETE FROM family_notes WHERE patient_id = 1");

    // 注入預設官方示範長輩個案：陳國華 (爸爸)
    db.run(`
      INSERT OR REPLACE INTO patients (id, name, age, gender, conditions, primary_hospital, updated_by, line_user_id)
      VALUES (1, '陳國華 (爸爸)', 72, '男', '高血壓第二期、慢性腎臟病第3期、夜尿症', '林口長庚紀念醫院', '官方臨床示範', NULL)
    `);

    // 注入示範診前指引卡 (專案護理師親自審核)
    db.run(`
      INSERT INTO discussion_guides (
        patient_id, department, doctor_name, visit_date, morning_bp, nocturia_count, symptoms, key_complaint, doctor_questions, triage_options, nurse_name
      ) VALUES (
        1, '心臟內科', '林主治醫師', '2026-11-12',
        '148 - 162 mmHg (連續10天晨峰偏高)',
        '3 - 4 次 / 每晚 (干擾睡眠、有跌倒風險)',
        '晨起頭暈、夜間起夜頻繁、下肢輕度凹陷水腫',
        '患者晨間收縮壓反覆達 148-162 mmHg 且夜尿次數由 1 次激增為 3-4 次，疑似夜間投用利尿劑排程不當，晨間降壓藥保護力不足。',
        '1. 是否將利尿劑 (Lasix) 由睡前移至早餐後服用？\n2. 脈優 (Norvasc) 是否改為早晨服用以覆蓋晨峰血壓？\n3. 是否加驗腎功能血清肌酸酐 (Cr/eGFR)？',
        '["原處方維持續開", "調整脈優/利尿劑至晨間 (QD AM)", "加開保護心腎之血管張力素阻斷劑 (ARB)", "安排兩週後複查腎功能與超音波"]',
        '王思婷 專科護理師'
      )
    `);

    // 注入示範口頭醫囑轉譯
    db.run(`
      INSERT INTO verbal_orders (
        patient_id, department, doctor_name, raw_input, condition_text, action_text, red_flags, recorded_by
      ) VALUES (
        1, '心臟內科', '林主治醫師',
        '如果早上量血壓收縮壓低於 110，那顆脈優 5mg 先停吃一次。利尿劑換到早上吃避免夜尿，若下肢水腫三天沒消要提早回來。',
        '清晨量測收縮壓 < 110 mmHg，或感到頭昏冒冷汗時。',
        '暫停當天早晨的「脈優 (Norvasc 5mg)」，利尿劑改為早餐後 30 分鐘內服用。其餘慢性藥物維持正常。',
        '連續兩天晨間血壓高於 170 mmHg、下肢水腫無改善、或平躺出現呼吸窘迫時，需立即回診。',
        '林口長庚 Hub 護理特助 - 王思婷'
      )
    `);

    // 注入前期藥袋處方 (Previous)
    const prevMeds = [
      { name: "Norvasc 脈優錠 5mg", code: "QD HS", frequency: "每日睡前一次", indication: "高血壓", note: "常規降壓" },
      { name: "Lasix 歐得通/利尿劑 40mg", code: "QD HS", frequency: "每日睡前一次", indication: "消水腫", note: "造成嚴重夜尿" },
      { name: "Crestor 冠脂妥 10mg", code: "QD HS", frequency: "每日睡前一次", indication: "降血脂", note: "常規維持" }
    ];
    db.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
      ) VALUES (
        1, '林口長庚紀念醫院', '心臟內科', '2026-10-15', 'previous',
        ?, '前期常規處方，利尿劑排於睡前服用造成嚴重夜尿與起夜跌倒隱患。'
      )
    `, [JSON.stringify(prevMeds)]);

    // 注入本期最新處方 (Current)
    const currentMeds = [
      { name: "Norvasc 脈優錠 5mg", code: "QD AM", frequency: "每日早晨一次", indication: "高血壓", changeType: "timing", changeNotice: "時段調整：由睡前 (HS) 改為晨間 (AM)，精準覆蓋晨峰血壓" },
      { name: "Lasix 歐得通/利尿劑 40mg", code: "QD AM", frequency: "每日早晨一次", indication: "消水腫", changeType: "timing", changeNotice: "時段調整：改至早餐後服用，徹底根治夜尿與跌倒隱患" },
      { name: "Diovan 得安穩 80mg", code: "QD HS", frequency: "每日睡前一次", indication: "心腎保護降壓", changeType: "new", changeNotice: "本期新增：兼顧慢性腎臟病第3期保護" },
      { name: "Crestor 冠脂妥 10mg", code: "QD HS", frequency: "每日睡前一次", indication: "降血脂", changeType: "same", changeNotice: "維持不變：常規續開" }
    ];
    db.run(`
      INSERT INTO prescriptions (
        patient_id, hospital_name, department, prescription_date, period_type, medications_json, inference_summary
      ) VALUES (
        1, '林口長庚紀念醫院', '心臟內科', '2026-11-05', 'current',
        ?, '【逆向推導診斷】本期處方成功將利尿劑與脈優由夜間調整至早晨服用，成功規避長輩夜間起夜 3-4 次之跌倒高風險；加開得安穩保護心腎。'
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

    // 注入全家協同留言記錄 (呈現竹科、雙北、海外手足協同)
    db.run(`
      INSERT INTO family_notes (patient_id, author, city, content)
      VALUES 
      (1, 'Alice 大女兒', '台北', '今晨致電確認爸爸已將利尿劑改為早餐後服用，昨晚起夜降為1次，睡眠精神顯著好轉。'),
      (1, 'David 小兒子', '竹科', '已與林口 Hub 特助陳護理師確認 11/20 新陳代謝科回診時段，我會由竹科開車接送。'),
      (1, 'James 長子', '海外(舊金山)', '美西同步收到雲端推播，本期降壓藥改早晨很正確，請大家持續關注晨峰血壓記錄。')
    `, (err) => {
      console.log("✅ CareNav 專業示範臨床數據已注入完成！");
      if (callback) callback(err);
    });
  });
}

function clearDemoData() {
  return new Promise((resolve, reject) => {
    console.log("🧹 正在清空 CareNav 示範資料以供登打自家數據...");
    db.serialize(() => {
      db.run("DELETE FROM verbal_orders WHERE patient_id = 1");
      db.run("DELETE FROM prescriptions WHERE patient_id = 1");
      db.run("DELETE FROM discussion_guides WHERE patient_id = 1");
      db.run("DELETE FROM hub_bookings WHERE patient_id = 1");
      db.run("DELETE FROM family_notes WHERE patient_id = 1");
      db.run(`
        UPDATE patients SET
          name = '自家長輩',
          age = NULL,
          conditions = '尚無慢性病紀錄 (點選可編輯)',
          primary_hospital = '常看診醫院 (點選可編輯)',
          updated_by = NULL,
          line_user_id = NULL
        WHERE id = 1
      `);
      db.run(`
        INSERT INTO family_notes (patient_id, author, city, content)
        VALUES (1, '系統引導', '雲端看板', '✨ 示範資料已清空！登入 LINE 後即可點選左側長輩卡片，綁定並登打您自家的長輩資訊。')
      `, (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  });
}

function restoreDemoData() {
  return new Promise((resolve, reject) => {
    injectDemoData((err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

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
  dbQuery,
  clearDemoData,
  restoreDemoData
};
