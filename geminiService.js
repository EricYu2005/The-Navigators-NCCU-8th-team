/**
 * geminiService.js
 * CareNav 智護領航 - Gemini LLM 智慧核心服務
 * 
 * 支援兩種對接方式：
 * 方式 A（企業級 GCP 服務帳號 / Vertex AI）：
 *   透過 Service Account 金鑰 (gcp-key.json) 與專案 ID (800743381042) 連線
 * 
 * 方式 B（快速原型 Google AI Studio API Key）：
 *   透過 .env 中的 GEMINI_API_KEY=AIzaSy... 連線
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

// 檢查 GCP 金鑰檔案是否存在
const GCP_KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS 
  ? path.resolve(process.env.GOOGLE_APPLICATION_CREDENTIALS) 
  : path.resolve(__dirname, 'gcp-key.json');

const HAS_GCP_KEY = fs.existsSync(GCP_KEY_PATH);
const HAS_API_KEY = !!process.env.GEMINI_API_KEY;

let vertexAIClient = null;
let googleAIClient = null;

// 初始化 LLM 客戶端
function initClients() {
  if (HAS_GCP_KEY) {
    try {
      const { VertexAI } = require('@google-cloud/vertexai');
      const projectId = process.env.GCP_PROJECT_ID || '800743381042';
      const location = process.env.GCP_LOCATION || 'asia-east1'; // 預設台灣機房 asia-east1 或 us-central1

      process.env.GOOGLE_APPLICATION_CREDENTIALS = GCP_KEY_PATH;

      vertexAIClient = new VertexAI({ project: projectId, location: location });
      console.log(`🤖 [LLM 就緒] 已成功以 GCP 服務帳號載入 Vertex AI (專案: ${projectId}, 機房: ${location})`);
    } catch (err) {
      console.warn('⚠️ 載入 @google-cloud/vertexai 失敗或套件未安裝:', err.message);
    }
  } else if (HAS_API_KEY) {
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      googleAIClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      console.log('🤖 [LLM 就緒] 已成功載入 Google AI Studio API Key 模式');
    } catch (err) {
      console.warn('⚠️ 載入 @google/generative-ai 失敗:', err.message);
    }
  } else {
    console.log('💡 [LLM 提示] 目前尚未偵測到 gcp-key.json 或 GEMINI_API_KEY，系統已自動啟用內建【臨床智慧規則引擎】提供展示服務。');
  }
}

initClients();

/**
 * 1. 診前臨床指引卡 (Doctor Discussion Guide) AI 濃縮生成
 */
async function generateDiscussionGuideWithAI({ department, doctorName, vitalsSummary, symptoms }) {
  const prompt = `
你是一位具備多年三甲醫院臨床經驗的心臟內科與高齡醫學主治醫師助理。
請將以下長輩零碎的生活生理記錄，濃縮為一張門診主治醫師「20 秒內能快速掃視完畢並做出臨床決策」的精準備忘錄。

【病患資料】
- 看診科別：${department}
- 主治醫師：${doctorName || '主治醫師'}
- 近期生理異常數據：${vitalsSummary}
- 主要生活困擾/自述症狀：${symptoms}

請嚴格輸出 JSON 格式（不要包含任何 markdown 或反引號）：
{
  "keyComplaint": "讓醫師一眼看懂的核心主訴與客觀生理變化趨勢（約50字以內，切中臨床要害）",
  "doctorQuestions": "列出 2-3 個最具決策價值的待診問題（例如是否調整時段、利尿劑劑量或檢驗項目，換行排列）",
  "triageOptions": ["醫師5秒快速勾選選項1", "醫師5秒快速勾選選項2", "醫師5秒快速勾選選項3", "醫師5秒快速勾選選項4"]
}
`;

  if (vertexAIClient) {
    try {
      const model = vertexAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const resp = await model.generateContent(prompt);
      const text = resp.response.candidates[0].content.parts[0].text;
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Vertex AI 調用失敗，啟用備援規則:', e.message);
    }
  } else if (googleAIClient) {
    try {
      const model = googleAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const resp = await model.generateContent(prompt);
      const text = resp.response.text();
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Google AI Studio 調用失敗，啟用備援規則:', e.message);
    }
  }

  // 備用規則引擎
  return {
    keyComplaint: `患者主訴【${symptoms || '常規回診'}】。近期生理特徵警示：${vitalsSummary}。`,
    doctorQuestions: "1. 晨間收縮壓持續偏高，降壓藥時段是否由睡前調整至晨間 (QD AM)？\n2. 下肢水腫與夜尿增加，是否調整利尿劑投藥時間？\n3. 是否安排常規抽血評估腎功能指數 (BUN/Cr)？",
    triageOptions: [
      "維持現有處方續開三個月",
      "調整脈優/利尿劑至早晨服用 (QD AM)",
      "加開保護心腎之血管張力素受體阻斷劑 (ARB)",
      "安排兩週後複查腎功能與心臟超音波"
    ]
  };
}

/**
 * 2. 診後口頭醫囑轉譯 (Verbal Orders Digitization)
 */
async function parseVerbalOrderWithAI(rawInput) {
  const prompt = `
你是一位專業的居家長照與臨床護理管家。長輩或陪診特助剛從診間出來，記錄了醫師的一段口頭交代。
請將這段口語對話，拆解轉譯為手足與看護都能嚴格執行的結構化行動卡。

【醫師口語原始紀錄】：
「${rawInput}」

請嚴格輸出 JSON 格式（不要包含任何 markdown 或反引號）：
{
  "conditionText": "觸發條件（明確具體的數值指標，例如：清晨血壓低於 110 mmHg 時）",
  "actionText": "具體行動處置（明確指引哪顆藥暫停、哪顆藥換時段）",
  "redFlags": "危急警訊與就醫時機（什麼情況下必須立即急診或聯絡特助）"
}
`;

  if (vertexAIClient) {
    try {
      const model = vertexAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const resp = await model.generateContent(prompt);
      const text = resp.response.candidates[0].content.parts[0].text;
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Vertex AI 口頭醫囑轉譯出錯:', e.message);
    }
  } else if (googleAIClient) {
    try {
      const model = googleAIClient.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const resp = await model.generateContent(prompt);
      const text = resp.response.text();
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(cleanJson);
    } catch (e) {
      console.error('Google AI Studio 口頭醫囑轉譯出錯:', e.message);
    }
  }

  // 備用規則引擎
  return {
    conditionText: "【生理觸發條件】清晨量測收縮壓 < 110 mmHg，或自覺頭暈冒冷汗時。",
    actionText: "【處置行動】當天早晨的降血壓藥 (脈優 5mg) 暫停服用一次，利尿劑改為早餐後服用。",
    redFlags: "【危急警訊】若停藥後下午血壓仍低於 95 mmHg，或伴隨呼吸喘促胸悶，請立即就醫。"
  };
}

module.exports = {
  generateDiscussionGuideWithAI,
  parseVerbalOrderWithAI,
  HAS_GCP_KEY,
  HAS_API_KEY
};
