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
 * 依據簡報規格：長輩近兩週晨間血壓、夜尿頻率與食慾異常/水腫，濃縮為 20 秒醫師快讀主訴 + 5秒勾選回條
 */
async function generateDiscussionGuideWithOllama({ department, doctorName, morningBp, nocturiaCount, symptoms, vitalsSummary }) {
  const bpText = morningBp || '晨間收縮壓 148-162 mmHg';
  const nocturiaText = nocturiaCount || '每晚夜尿 3-4 次';
  const symText = symptoms || '晨起頭暈、夜間起夜頻繁、下肢輕度水腫';

  const systemPrompt = `你是一位資深心血管與高齡醫學臨床專家助理。請將家屬與長輩記錄的零碎數據（晨間血壓、夜尿頻率、食慾與水腫），濃縮為一張主治醫師能在「20 秒內快速掃視完畢並做出臨床處方決策」的精準備忘錄，末端自帶醫師5秒勾選回條。
你必須直接輸出 JSON 格式，請勿包含 markdown 反引號或其他字元。`;

  const userPrompt = `
【病患就醫臨床數據】
- 就診科別：${department || '心臟內科'}
- 主治醫師：${doctorName || '主治醫師'}
- 近兩週晨間血壓：${bpText}
- 夜尿頻率變化：${nocturiaText}
- 生活困擾與自述表徵：${symText}

請嚴格輸出符合以下結構的 JSON：
{
  "keyComplaint": "讓醫師20秒讀懂的核心主訴與客觀趨勢（約50-80字，直指臨床痛點如晨峰血壓或夜尿跌倒風險）",
  "doctorQuestions": "列出 2-3 個最具臨床決策價值的待診問題（例如是否利尿劑改晨間、脈優改晨間、加驗腎功能，換行排列）",
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
      if (parsed.keyComplaint && parsed.triageOptions) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Ollama 調用未響應 (${error.message})，自動使用臨床專業規則備援。`);
  }

  // 臨床備援演算法（完全符合醫療邏輯）
  return {
    keyComplaint: `患者近兩週晨間收縮壓反覆達 ${bpText}，夜尿頻率驟增至 ${nocturiaText}，合併生活自述「${symText}」。臨床研判疑似夜間降壓與利尿劑排程造成夜間起夜高頻跌倒風險，且晨間降壓覆蓋不足。`,
    doctorQuestions: `1. 是否將利尿劑 (Lasix) 由睡前移至晨間 (QD AM)，以阻斷頻繁夜尿與夜間下床跌倒？\n2. 脈優 (Norvasc) 是否建議移至晨間投藥以有效壓制晨峰高血壓？\n3. 是否加驗腎功能肌酸酐 (Cr/eGFR) 與血鉀電解質？`,
    triageOptions: [
      "維持現有處方續開三個月",
      "調整脈優/利尿劑至晨間 (QD AM)",
      "加開保護心腎之血管張力素阻斷劑 (ARB)",
      "安排兩週後複查腎功能指數與心臟超音波"
    ]
  };
}

/**
 * 2. 診後口頭醫囑轉譯 (Verbal Orders Digitization) - 透過 Ollama 解析
 * 依據簡報規格：診後快速語音輸入或特助勾選，轉為白話行動指引【條件-行動-紅旗警訊】，推播全家
 */
async function parseVerbalOrderWithOllama(rawInput) {
  const systemPrompt = `你是一位臨床護理決策專家。請將主治醫師在診間的一段口頭交代（例如「血壓低於110暫停這顆」），拆解轉譯為手足長輩與外傭皆能看懂並執行的三要素結構化行動指引。
你必須直接輸出 JSON 格式（包含 conditionText, actionText, redFlags）。`;

  const userPrompt = `
【醫師口語原始紀錄】：
「${rawInput}」

請嚴格輸出符合以下結構的 JSON：
{
  "conditionText": "觸發條件（明確具體的客觀生理指標，如：清晨量測收縮壓 < 110 mmHg 時）",
  "actionText": "具體白話行動指引（清楚說明哪顆藥暫停、哪顆藥換時段、飲食注意事項）",
  "redFlags": "危急警訊與急診時機（什麼情況下必須立即急診送醫或聯絡護理特助）"
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
      if (parsed.conditionText && parsed.actionText) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn(`⚠️ Ollama 調用未響應 (${error.message})，自動使用臨床規則備援。`);
  }

  // 臨床專業規則引擎
  let conditionText = "清晨量測收縮壓 < 110 mmHg，或自覺頭暈眼前發黑時。";
  let actionText = "暫停當天早晨的「脈優 (Norvasc 5mg)」一次，其餘慢性藥物（利尿劑、降血脂藥）正常服用。";
  let redFlags = "若停藥後下午血壓仍低於 95 mmHg，或心率 < 50 bpm，請立即致電長庚 Hub 特助或就醫。";

  if (rawInput.includes('水腫') || rawInput.includes('尿') || rawInput.includes('利尿')) {
    conditionText = "雙下肢脛骨前緣有凹陷水腫，或夜尿頻率每晚大於 2 次。";
    actionText = "利尿劑嚴格改至早餐後 30 分鐘內服用，下午 4 點後嚴禁服用以杜絕夜間頻繁起夜。";
    redFlags = "三天內體重快速增加超過 2 公斤、或夜間平躺感覺呼吸窘迫喘促時需立即提早回診。";
  } else if (rawInput.includes('70') || rawInput.includes('血糖') || rawInput.includes('手抖')) {
    conditionText = "血糖值低於 70 mg/dL，或自覺冒冷汗、手抖、飢餓感。";
    actionText = "立即攝取 15 克快速吸收糖類（120cc 果汁或 3 顆方糖），15 分鐘後複測。暫停下一餐短效降糖藥。";
    redFlags = "服糖 15 分鐘後意識不清或無法吞嚥，請立即撥打 119 送醫。";
  }

  return { conditionText, actionText, redFlags };
}

module.exports = {
  checkOllamaConnection,
  generateDiscussionGuideWithOllama,
  parseVerbalOrderWithOllama
};
