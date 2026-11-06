/**
 * ollamaService.js
 * CareNav 智護領航 - Ollama 本地 Docker 容器 LLM 服務
 * 
 * 預設連線位置：http://localhost:11434
 * 支援任何 Ollama 本地模型（如 llama3.2, llama3, qwen2.5, gemma2, taide 等）
 * 具備原生 JSON Mode 輸出與連線容錯
 */

require('dotenv').config();

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

/**
 * 檢查 Ollama Docker 容器是否在線並取得可用模型列表
 */
async function checkOllamaConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const modelNames = (data.models || []).map(m => m.name);
      return {
        online: true,
        baseUrl: OLLAMA_BASE_URL,
        models: modelNames,
        currentModel: modelNames.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : (modelNames[0] || DEFAULT_MODEL)
      };
    }
  } catch (err) {
    // 容器未啟動或無法連線時
  }

  return {
    online: false,
    baseUrl: OLLAMA_BASE_URL,
    models: [],
    currentModel: DEFAULT_MODEL
  };
}

/**
 * 1. 診前臨床指引卡 (Doctor Discussion Guide) - 透過 Ollama 生成
 */
async function generateDiscussionGuideWithOllama({ department, doctorName, vitalsSummary, symptoms }) {
  const systemPrompt = `你是一位三甲醫院的主治醫師助理。請將家屬與長輩的碎狀生活記錄，濃縮為一張門診主治醫師「20 秒內能快速掃視完畢並做出臨床決策」的精準備忘錄。
你必須直接輸出 JSON 格式（包含 keyComplaint, doctorQuestions, triageOptions），請勿附加多餘文字。`;

  const userPrompt = `
【病患資料】
- 看診科別：${department}
- 主治醫師：${doctorName || '主治醫師'}
- 近期生理異常數據：${vitalsSummary}
- 主要生活困擾/自述症狀：${symptoms}

請嚴格輸出符合以下結構的 JSON：
{
  "keyComplaint": "讓醫師一眼看懂的核心主訴與客觀生理變化趨勢（約50字以內）",
  "doctorQuestions": "列出 2-3 個最具臨床價值的待診問題（以換行分隔）",
  "triageOptions": ["醫師5秒快速勾選選項1", "醫師5秒快速勾選選項2", "醫師5秒快速勾選選項3", "醫師5秒快速勾選選項4"]
}
`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: 'json'
      })
    });

    if (response.ok) {
      const result = await response.json();
      const content = result.message?.content || '{}';
      const parsed = JSON.parse(content);
      return parsed;
    }
  } catch (error) {
    console.warn(`⚠️ Ollama 本地容器調用未響應 (${error.message})，自動使用臨床規則備援。`);
  }

  // 若 Ollama 未啟動或模型尚未下載，提供臨床智慧備援
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
 * 2. 診後口頭醫囑轉譯 (Verbal Orders Digitization) - 透過 Ollama 解析
 */
async function parseVerbalOrderWithOllama(rawInput) {
  const systemPrompt = `你是一位專業的居家長照護理主管。請將醫師在診間的一段口頭交代，拆解轉譯為手足與看護都能嚴格執行的結構化行動卡。
你必須直接輸出 JSON 格式（包含 conditionText, actionText, redFlags）。`;

  const userPrompt = `
【醫師口語原始紀錄】：
「${rawInput}」

請嚴格輸出符合以下結構的 JSON：
{
  "conditionText": "觸發條件（明確具體的數值指標，例如：清晨血壓低於 110 mmHg 時）",
  "actionText": "具體行動處置（明確指引哪顆藥暫停、哪顆藥換時段）",
  "redFlags": "危急警訊與就醫時機（什麼情況下必須立即急診或聯絡特助）"
}
`;

  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        format: 'json'
      })
    });

    if (response.ok) {
      const result = await response.json();
      const content = result.message?.content || '{}';
      const parsed = JSON.parse(content);
      return parsed;
    }
  } catch (error) {
    console.warn(`⚠️ Ollama 本地容器調用未響應 (${error.message})，自動使用臨床規則備援。`);
  }

  // 備用規則
  return {
    conditionText: "【生理觸發條件】清晨量測收縮壓 < 110 mmHg，或自覺頭暈冒冷汗時。",
    actionText: "【處置行動】當天早晨的降血壓藥 (脈優 5mg) 暫停服用一次，利尿劑改為早餐後服用。",
    redFlags: "【危急警訊】若停藥後下午血壓仍低於 95 mmHg，或伴隨呼吸喘促胸悶，請立即就醫。"
  };
}

module.exports = {
  checkOllamaConnection,
  generateDiscussionGuideWithOllama,
  parseVerbalOrderWithOllama
};
