# CareNav 智護領航 - 臨床 Demo 情境檔案庫 (Demo Scenarios)

本目錄存放用於商業競賽、課堂展示（Demo）與系統測試的擬真臨床情境 JSON 檔案。
您可以自由修改現有情境，或新增自訂情境檔案（如 `scenario-d-custom.json`），系統提供 API 與前台「載入情境檔案」功能，便於隨時匯入展示。

---

## 現有情境檔案列表

1. **`scenario-a-hypertension-nocturia.json`**
   - **主角**：王奶奶 (82歲)
   - **臨床衝突**：利尿劑 (Lasix) 睡前服用引發每晚起夜 3-4 次，造成嚴重夜間跌倒骨折風險；晨起晨峰高血壓反覆達 162 mmHg。
   - **核心價值**：展示「診前臨床指引卡 20s 備忘」、「口頭醫囑轉譯 (SBP < 110 停脈優)」、「處方逆向推導 (QD HS -> QD AM)」與「DrugBank MCP CCB+ARB 協同降壓」。

2. **`scenario-b-diabetes-ddi-alert.json`**
   - **主角**：陳爺爺 (76歲)
   - **臨床衝突**：晨間低血糖 (62 mg/dL)；自行服用骨科消炎止痛藥 (NSAID)，與心血管抗血小板藥 (Aspirin) 發生致命 Major DDI 胃大出血交互作用。
   - **核心價值**：展示「口頭醫囑低血糖急救處理」、「DrugBank MCP 攔截 Major DDI 致命多重用藥衝突」與「加開 Nexium 胃壁保護劑」。

3. **`scenario-c-elderly-beers-criteria.json`**
   - **主角**：林伯伯 (79歲)
   - **臨床衝突**：頑固性失眠要求開立 Stilnox (使蒂諾斯 Zolpidem)，服藥後夜間夢遊、神智恍惚差點跌倒。
   - **核心價值**：展示「DrugBank MCP 觸發高齡 Beers Criteria 高跌倒骨折致命風險警示」與「漸進式減量停藥」。

---

## 自訂情境檔案 JSON 格式規範

若要新增您自己的情境，請建立一個 `.json` 檔案，包含以下欄位：

```json
{
  "scenarioId": "scenario-custom-01",
  "title": "情境標題（例如：張爺爺 - 痛風併高血壓）",
  "description": "簡要描述個案臨床痛點與核心衝突",
  "patient": {
    "id": 1,
    "name": "病患長輩姓名",
    "age": 80,
    "gender": "男/女",
    "careCategory": "照護類別標籤",
    "primaryHospital": "醫院名稱",
    "department": "就診科別",
    "doctorName": "主治醫師姓名",
    "visitDate": "2026-12-01",
    "chronicConditions": [
      "慢性病1",
      "慢性病2"
    ]
  },
  "doctorDiscussionGuide": {
    "morningBp": "晨間血壓紀錄趨勢",
    "nocturiaCount": "夜尿次數與嚴重度",
    "symptoms": "生活困擾與自述表徵"
  },
  "verbalOrder": {
    "rawInput": "主治醫師在診間的急促口頭交代語音文字",
    "recordedBy": "紀錄護理特助姓名",
    "department": "科別・醫師"
  },
  "prescriptions": {
    "previous": [
      { "name": "舊藥名", "code": "QD HS", "ind": "舊適應症" }
    ],
    "current": [
      { "name": "新藥名", "code": "QD AM", "ind": "新用法說明" }
    ]
  },
  "familyNotes": [
    { "authorLocation": "台北", "authorName": "大女兒", "noteText": "家屬留言", "noteType": "日常叮嚀" }
  ]
}
```

---

## 如何在系統中載入情境

1. **直接由前台載入**：在 CareNav 前台頂部點擊「📂 載入情境檔案」，選擇本目錄下的任何情境檔，或直接上傳您本機編輯好的 JSON 檔案。
2. **透過 API 取得**：後端提供 `GET /api/scenarios` 取得所有檔案清單，以及 `GET /api/scenarios/:id` 讀取特定情境內容。
