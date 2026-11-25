/**
 * vertexAiService.js
 * Google Cloud Vertex AI (Gemini Multimodal) 保健食品包裝與成分表辨識服務
 *
 * 零外部 SDK 依賴：使用 Node.js 內建 crypto 簽署 Service Account JWT，
 * 換取 OAuth2 Access Token 並直接呼叫 Vertex AI REST API。
 *
 * 支援兩種憑證載入方式：
 * 1. 環境變數 GCP_SERVICE_ACCOUNT_JSON（原始 JSON 字串或 Base64 編碼，推薦 Render 雲端部署使用）
 * 2. 本機金鑰檔案路徑 GCP_PROJECT_KEY / GOOGLE_APPLICATION_CREDENTIALS（預設 ./service_account.json）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const VERTEX_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

const VALID_CATEGORIES = ['魚油', '葉黃素', '益生菌', 'B群', '鈣鎂D', '膠原蛋白'];
const VALID_TIMINGS = ['隨餐/飯後', '早上空腹', '睡前'];
const VALID_NUTRIENT_KEYS = [
  'omega3',
  'lutein',
  'zeaxanthin',
  'probiotics',
  'vitamin_b',
  'calcium',
  'magnesium',
  'vitamin_d',
  'vitamin_c',
  'zinc',
  'iron',
  'collagen',
  'gaba',
  'uc2'
];

let cachedCredentials = null;
let cachedAccessToken = null;
let cachedTokenExpiresAt = 0;

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * 載入 GCP 憑證（同時支援 service_account 金鑰與 Render WIF external_account 設定檔）
 */
function loadGcpCredentials() {
  if (cachedCredentials) return cachedCredentials;

  // 1. 優先檢查雲端環境變數 GCP_SERVICE_ACCOUNT_JSON
  const rawJsonEnv = (process.env.GCP_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJsonEnv) {
    let parsed;
    try {
      parsed = JSON.parse(rawJsonEnv);
    } catch (_) {
      const decoded = Buffer.from(rawJsonEnv, 'base64').toString('utf8');
      parsed = JSON.parse(decoded);
    }
    if ((parsed.client_email && parsed.private_key) || parsed.type === 'external_account') {
      cachedCredentials = parsed;
      return cachedCredentials;
    }
    throw new Error('GCP_SERVICE_ACCOUNT_JSON 格式不正確');
  }

  // 2. 檢查 Render 自動掛載的 GOOGLE_APPLICATION_CREDENTIALS 或本機金鑰檔案路徑
  const candidates = [
    (process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim(),
    (process.env.GCP_PROJECT_KEY || '').trim(),
    path.resolve(__dirname, 'service_account.json'),
    path.resolve(__dirname, 'gcp-key.json')
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.isAbsolute(candidate)
      ? candidate
      : path.resolve(__dirname, candidate);
    if (fs.existsSync(resolved)) {
      const parsed = JSON.parse(fs.readFileSync(resolved, 'utf8'));
      if ((parsed.client_email && parsed.private_key) || parsed.type === 'external_account') {
        cachedCredentials = parsed;
        return cachedCredentials;
      }
    }
  }

  throw new Error('找不到有效的 GCP 憑證（請確認本機 service_account.json、Render WIF 或 GCP_SERVICE_ACCOUNT_JSON 已設定）');
}

function isVertexAiConfigured() {
  try {
    loadGcpCredentials();
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * 透過 Render / GCP Workload Identity Federation (external_account) 換取 Access Token
 */
async function getExternalAccountAccessToken(creds) {
  const src = creds.credential_source || {};
  let subjectToken = '';

  if (src.file) {
    const raw = fs.readFileSync(src.file, 'utf8').trim();
    if (src.format?.type === 'json' && src.format?.subject_token_field_name) {
      const obj = JSON.parse(raw);
      subjectToken = String(obj[src.format.subject_token_field_name] || '').trim();
    } else {
      subjectToken = raw;
    }
  } else if (src.url) {
    const headers = src.headers || {};
    const res = await fetch(src.url, { headers });
    const raw = (await res.text()).trim();
    if (!res.ok) {
      throw new Error(`無法從 credential_source.url 取得 OIDC Token (${res.status})`);
    }
    if (src.format?.type === 'json' && src.format?.subject_token_field_name) {
      const obj = JSON.parse(raw);
      subjectToken = String(obj[src.format.subject_token_field_name] || '').trim();
    } else {
      subjectToken = raw;
    }
  } else {
    throw new Error('external_account 缺少有效的 credential_source (file 或 url)');
  }

  if (!subjectToken) {
    throw new Error('無法讀取外部 OIDC subject token');
  }

  // Step 1: 向 Google STS 交換 Federated Token
  const stsUrl = creds.token_url || 'https://sts.googleapis.com/v1/token';
  const stsRes = await fetch(stsUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grantType: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: creds.audience,
      scope: VERTEX_SCOPE,
      requestedTokenType: 'urn:ietf:params:oauth:token-type:access_token',
      subjectToken,
      subjectTokenType: creds.subject_token_type || 'urn:ietf:params:oauth:token-type:jwt'
    })
  });

  const stsJson = await stsRes.json().catch(() => ({}));
  if (!stsRes.ok || !stsJson.access_token) {
    throw new Error(`GCP STS Token 交換失敗 (${stsRes.status}): ${stsJson.error_description || stsJson.error || '未知錯誤'}`);
  }

  // Step 2: 若有設定 Service Account Impersonation，進一步換取目標 SA 的 Access Token
  if (creds.service_account_impersonation_url) {
    const impRes = await fetch(creds.service_account_impersonation_url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stsJson.access_token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        scope: [VERTEX_SCOPE],
        lifetime: '3600s'
      })
    });
    const impJson = await impRes.json().catch(() => ({}));
    if (!impRes.ok || !impJson.accessToken) {
      throw new Error(`GCP Service Account 模擬授權失敗 (${impRes.status}): ${impJson.error?.message || '未知錯誤'}`);
    }
    const expiresAt = impJson.expireTime
      ? Math.floor(new Date(impJson.expireTime).getTime() / 1000)
      : Math.floor(Date.now() / 1000) + 3600;
    return { accessToken: impJson.accessToken, expiresAt };
  }

  return {
    accessToken: stsJson.access_token,
    expiresAt: Math.floor(Date.now() / 1000) + (Number(stsJson.expires_in) || 3600)
  };
}

/**
 * 取得或刷新 Google Cloud OAuth2 Access Token
 */
async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedTokenExpiresAt - 300 > now) {
    return cachedAccessToken;
  }

  const creds = loadGcpCredentials();

  // 支援 Render Workload Identity Federation (external_account)
  if (creds.type === 'external_account') {
    const { accessToken, expiresAt } = await getExternalAccountAccessToken(creds);
    cachedAccessToken = accessToken;
    cachedTokenExpiresAt = expiresAt;
    return cachedAccessToken;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: creds.client_email,
    scope: VERTEX_SCOPE,
    aud: creds.token_uri || OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600
  };

  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(payload))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(unsignedJwt);
  signer.end();
  const signature = base64UrlEncode(signer.sign(creds.private_key));
  const assertion = `${unsignedJwt}.${signature}`;

  const tokenRes = await fetch(creds.token_uri || OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });

  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    throw new Error(`無法取得 GCP Access Token (${tokenRes.status}): ${tokenJson.error_description || tokenJson.error || '未知錯誤'}`);
  }

  cachedAccessToken = tokenJson.access_token;
  cachedTokenExpiresAt = now + (Number(tokenJson.expires_in) || 3600);
  return cachedAccessToken;
}

/**
 * 清理並解析模型回傳的 JSON
 */
function parseModelJson(text) {
  const trimmed = String(text || '').trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const startIdx = candidate.indexOf('{');
  const endIdx = candidate.lastIndexOf('}');
  if (startIdx === -1 || endIdx === -1) {
    throw new Error('AI 回傳內容不含有效 JSON');
  }
  return JSON.parse(candidate.slice(startIdx, endIdx + 1));
}

/**
 * 正規化 AI 解析後的保健食品欄位，確保與 PurePick 資料庫格式一致
 */
function normalizeSupplementResult(raw) {
  const brand = String(raw.brand || '').trim();
  const name = String(raw.name || '').trim();

  let category = String(raw.category || '').trim();
  if (!VALID_CATEGORIES.includes(category)) {
    const combined = `${brand} ${name} ${raw.active_summary || ''}`;
    if (/魚油|omega|epa|dha/i.test(combined)) category = '魚油';
    else if (/葉黃素|lutein|玉米黃素/i.test(combined)) category = '葉黃素';
    else if (/益生菌|乳酸菌|probiotic/i.test(combined)) category = '益生菌';
    else if (/b群|維生素b|維他命b|vitamin\s*b/i.test(combined)) category = 'B群';
    else if (/鈣|鎂|維生素d|uc2|uc-ii|關節/i.test(combined)) category = '鈣鎂D';
    else if (/膠原蛋白|collagen/i.test(combined)) category = '膠原蛋白';
    else category = '魚油';
  }

  let recommendedTiming = String(raw.recommended_timing || '').trim();
  if (!VALID_TIMINGS.includes(recommendedTiming)) {
    if (/睡前|晚/.test(recommendedTiming)) recommendedTiming = '睡前';
    else if (/空腹|早上/.test(recommendedTiming)) recommendedTiming = '早上空腹';
    else recommendedTiming = '隨餐/飯後';
  }

  const totalUnits = Number.isFinite(Number(raw.total_units)) && Number(raw.total_units) > 0
    ? Math.round(Number(raw.total_units))
    : null;
  const dailyUnits = Number.isFinite(Number(raw.daily_units)) && Number(raw.daily_units) > 0
    ? Math.round(Number(raw.daily_units))
    : null;
  const price = Number.isFinite(Number(raw.price)) && Number(raw.price) >= 50
    ? Math.round(Number(raw.price))
    : null;

  const nutrients = {};
  if (raw.nutrients && typeof raw.nutrients === 'object') {
    for (const key of VALID_NUTRIENT_KEYS) {
      const val = Number(raw.nutrients[key]);
      if (Number.isFinite(val) && val > 0) {
        nutrients[key] = Math.round(val * 100) / 100;
      }
    }
  }

  return {
    brand,
    name,
    category,
    recommended_timing: recommendedTiming,
    price,
    total_units: totalUnits,
    daily_units: dailyUnits,
    dosage_form: String(raw.dosage_form || '').trim() || '膠囊/錠劑',
    absorption_form: String(raw.absorption_form || '').trim() || '一般標準型',
    active_summary: String(raw.active_summary || '').trim(),
    nutrients,
    additives_note: String(raw.additives_note || '').trim(),
    confidence_note: String(raw.confidence_note || '').trim()
  };
}

/**
 * 從憑證內容（service_account 或 Render WIF external_account）自動推導 GCP Project ID / Number
 * 走 WIF 時完全不需要額外在環境變數重複填寫 GCP_PROJECT_ID
 */
function resolveGcpProject(creds) {
  if (creds.project_id) return creds.project_id;
  if (creds.quota_project_id) return creds.quota_project_id;

  // 從 service_account_impersonation_url 擷取專案 ID（例如 ...@gen-lang-client-0610302397.iam.gserviceaccount.com...）
  if (creds.service_account_impersonation_url) {
    const saMatch = String(creds.service_account_impersonation_url).match(/@([^.]+)\.iam\.gserviceaccount\.com/i);
    if (saMatch && saMatch[1]) return saMatch[1];
  }

  // 從 audience 擷取專案編號（例如 //iam.googleapis.com/projects/123456789012/locations/global/...）
  if (creds.audience) {
    const audMatch = String(creds.audience).match(/projects\/([^/]+)\//i);
    if (audMatch && audMatch[1]) return audMatch[1];
  }

  const envProjectId = (process.env.GCP_PROJECT_ID || '').trim();
  if (envProjectId) return envProjectId;

  const rawGcpProject = (process.env.GCP_PROJECT || '').trim();
  if (rawGcpProject) {
    const pathMatch = rawGcpProject.match(/projects\/([^/]+)\//i);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    if (!rawGcpProject.includes('/')) return rawGcpProject;
  }

  return '';
}

/**
 * 呼叫 Vertex AI Gemini 多模態模型辨識保健食品包裝 / 成分表照片
 * @param {Object} params
 * @param {string} params.imageBase64 - 不含 data:image/... 前綴的純 base64 字串
 * @param {string} params.mimeType - 如 image/jpeg, image/png, image/webp
 */
async function analyzeSupplementImage({ imageBase64, mimeType = 'image/jpeg' }) {
  const creds = loadGcpCredentials();
  const projectId = resolveGcpProject(creds);
  const location = (process.env.GCP_LOCATION || 'global').trim();
  const preferredModel = (process.env.VERTEX_AI_MODEL || 'gemini-3.5-flash').trim();

  if (!projectId) {
    throw new Error('無法從 WIF 憑證或環境變數取得 GCP 專案識別碼');
  }

  const accessToken = await getAccessToken();

  const promptText = `你是一位專業的台灣營養師與保健食品標示解析專家。
請仔細檢視這張保健食品的外包裝或背面營養標示照片，盡可能精準萃取產品資訊，並嚴格只回傳一個 JSON 物件（不要任何額外文字或 Markdown 解說）。

JSON 欄位規格如下：
{
  "brand": "品牌名稱（繁體中文或原品牌名，若照片看不出來請填空字串）",
  "name": "商品完整名稱（繁體中文，若照片看不出來請填空字串）",
  "category": "必須從以下六選一：魚油 | 葉黃素 | 益生菌 | B群 | 鈣鎂D | 膠原蛋白",
  "recommended_timing": "依產品成分或包裝建議，從以下三選一：隨餐/飯後 | 早上空腹 | 睡前",
  "price": null,
  "total_units": 整瓶或整盒的總顆數/粒數/包數（整數，看不出來填 null）,
  "daily_units": 每日建議食用顆數/粒數/包數（整數，看不出來填 null）,
  "dosage_form": "劑型，例如：軟膠囊、膠囊、錠劑、粉包",
  "absorption_form": "吸收型態或專利標示，例如：rTG高吸收型、游離型葉黃素、海藻鈣、一般標準型",
  "active_summary": "一句簡短繁體中文重點有效成分摘要（例如：Omega-3 1000mg (EPA 600mg + DHA 400mg)）",
  "nutrients": {
    "omega3": 每日份 Omega-3 毫克數(mg),
    "lutein": 每日份葉黃素毫克數(mg),
    "zeaxanthin": 每日份玉米黃素毫克數(mg),
    "probiotics": 每日份益生菌億數(例如 300 億填 300),
    "vitamin_b": 綜合B群約略每日建議量百分比(例如 100),
    "calcium": 每日份鈣毫克數(mg),
    "magnesium": 每日份鎂毫克數(mg),
    "vitamin_d": 每日份維生素D IU數(1微克mcg = 40 IU),
    "vitamin_c": 每日份維生素C毫克數(mg),
    "zinc": 每日份鋅毫克數(mg),
    "iron": 每日份鐵毫克數(mg),
    "collagen": 每日份膠原蛋白毫克數(mg),
    "gaba": 每日份GABA毫克數(mg),
    "uc2": 每日份UC-II非變性二型膠原蛋白毫克數(mg)
  },
  "additives_note": "是否含額外糖分、香料或特殊注意事項（繁體中文簡短說明）",
  "confidence_note": "簡短提醒使用者哪些欄位是AI推測或照片未顯示（如售價、背面成分表）需手動確認"
}

重要規則：
1. nutrients 物件中，只保留照片中確實有標示或可合理推算的成分鍵值，沒有的成分請不要填入或填 0。
2. 請注意區分「每份」與「每粒」以及「每日建議份數」，nutrients 請盡量換算為「每日建議攝取量」。
3. 若照片完全不是保健食品（例如風景、人物、模糊無法辨識），請在 confidence_note 清楚說明並保留其他欄位為空字串或 null。`;

  const modelCandidates = [...new Set([
    preferredModel,
    'gemini-3.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash-lite'
  ])];

  const apiHost = location === 'global'
    ? 'aiplatform.googleapis.com'
    : `${location}-aiplatform.googleapis.com`;

  let lastError = null;
  for (const model of modelCandidates) {
    const endpoint = `https://${apiHost}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: promptText },
              {
                inlineData: {
                  mimeType,
                  data: imageBase64
                }
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.15,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json'
        }
      })
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const parts = data?.candidates?.[0]?.content?.parts || [];
      const text = parts
        .filter((p) => !p.thought && typeof p.text === 'string')
        .map((p) => p.text)
        .join('')
        .trim();
      if (!text) {
        throw new Error('Vertex AI 回傳空白結果，請換一張更清晰的照片再試');
      }
      const parsed = parseModelJson(text);
      return {
        model,
        location,
        result: normalizeSupplementResult(parsed)
      };
    }

    const errMsg = data?.error?.message || `HTTP ${response.status}`;
    lastError = new Error(`Vertex AI (${model}) 呼叫失敗：${errMsg}`);

    // 只有模型不存在 (404) 時才嘗試下一個備援模型
    if (response.status !== 404) {
      throw lastError;
    }
  }

  throw lastError || new Error('Vertex AI 無法找到可用的 Gemini 模型');
}

/**
 * 當 Vertex AI 未設定或網路異常時，依據精算數據組裝高質感結構化備援文案，確保訪談現場 100% 不開天窗
 */
function buildFallbackA4Narrative({ subjectName, subjectNote, purchased = [], wishlist = [], analysis = {} }) {
  const alerts = analysis.redundancyAlerts || [];
  const dosageChecks = analysis.dosageChecks || [];
  const exceedItems = dosageChecks.filter((d) => d.status === 'exceed_ul');
  const highItems = dosageChecks.filter((d) => d.status === 'duplicate_high');
  const lowItems = dosageChecks.filter((d) => d.status === 'low');
  const saved = Math.round(Number(analysis.potentialMonthlySavings || 0));
  const totalBottles = purchased.length + wishlist.length;

  let overallGrade = 'A';
  if (exceedItems.length > 0 || alerts.length >= 2) overallGrade = 'C';
  else if (alerts.length === 1 || highItems.length > 0) overallGrade = 'B';

  const headline = alerts.length > 0
    ? `偵測到 ${alerts.length} 組重複配方，精簡後月省 NT$ ${saved}`
    : (exceedItems.length > 0 ? '部分營養素超過每日上限，建議調整劑量' : '跨品牌營養配置均衡，無明顯重複浪費');

  const executiveSummary = `${subjectName || '受測者'}目前共評估 ${totalBottles} 款保健品${subjectNote ? `（背景：${subjectNote.slice(0, 22)}）` : ''}。系統交叉比對衛福部 DRIs 標準後，${alerts.length > 0 ? `發現可剔除重複品項，每年約省 NT$ ${saved * 12}。` : '各品類互補性良好，按建議時段服用即可發揮最佳效益。'}`;

  const redundancyNarrative = alerts.length > 0
    ? `清單中出現同成分重疊（如${alerts.slice(0, 2).map((a) => a.dropProductName).join('、')}），單罐雖皆合法，但同時購買造成基礎微量元素重複花費。建議優先保留高吸收率與高性價比主力款，每月立省 NT$ ${saved}。`
    : '目前「正在服用」與「考慮購買」品項之核心機能互不重疊，無須刪減瓶罐，預算配置相當精明，每一分錢皆花在刀口上。';

  let dosageSafetyNarrative = '各主要營養素總和皆落在衛福部國健署建議攝取範圍內，無超過每日上限（UL）之虞，可安心維持目前每日建議份數。';
  if (exceedItems.length > 0) {
    dosageSafetyNarrative = `注意：【${exceedItems.map((d) => d.name).join('、')}】跨瓶加總已突破衛福部每日上限（UL），長期超量恐增加身體代謝負擔，建議立即減半份數或停用重複來源。`;
  } else if (highItems.length > 0) {
    dosageSafetyNarrative = `【${highItems.map((d) => d.name).join('、')}】來自多瓶複方疊加，總量偏高但尚未破 UL 紅線；日常飲食若有攝取相關食物，建議擇一主力補充即可。`;
  } else if (lowItems.length > 0) {
    dosageSafetyNarrative = `安全性良好無超標，惟【${lowItems.map((d) => d.name).join('、')}】屬於日常基礎打底劑量，若追求顯著體感可於下次補貨時挑選足量配方。`;
  }

  const timingNarrative = (analysis.timingWarnings && analysis.timingWarnings.length > 0)
    ? '脂溶性成分（魚油、葉黃素、維生素D）務必隨餐或飯後吃以提升吸收率；益生菌宜早空腹或睡前；含鈣與含鐵品項請錯開 2 小時以上避免腸道競爭吸收。'
    : '建議依上方早空腹、隨餐飯後、睡前分流表固定作息服用，可大幅減少腸胃刺激並維持穩定吸收率。';

  const hasOmegaOrHerb = [...purchased, ...wishlist].some((x) => /(魚油|藻油|紅麴|銀杏|納豆)/i.test(`${x.category || ''} ${x.name || ''}`));
  const doctorAndActionNarrative = hasOmegaOrHerb
    ? '清單含魚油等影響凝血或代謝成分，門診開立慢性病西藥（如抗凝血劑、降血脂藥）或拔牙手術前，請務必出示看診清單告知醫師，並優先剔除重複品項。'
    : '就醫領取處方西藥（如抗生素、胃藥）時，請主動告知醫師目前保健品清單並與西藥間隔 2 小時服用；下月補貨前建議持續記錄身體體感變化。';

  return {
    overallGrade,
    headline,
    executiveSummary,
    redundancyNarrative,
    dosageSafetyNarrative,
    timingNarrative,
    doctorAndActionNarrative,
    interviewQuestions: [
      '看到這份跨品牌重疊與每月花費試算後，哪一項發現最讓您意外？',
      '過去選購時是否曾注意過不同品牌複方裡的重複微量元素（如鋅、維生素C/E）？'
    ]
  };
}

/**
 * 統一 Prompt 呼叫 Vertex AI (Gemini) 產出「單頁 A4 使用者訪談專屬評估報告」結構化文案
 */
async function generateA4InterviewReport({ subjectName = '受測消費者', subjectNote = '', purchased = [], wishlist = [], analysis = {} }) {
  const cleanName = String(subjectName || '受測消費者').trim().slice(0, 40) || '受測消費者';
  const cleanNote = String(subjectNote || '').trim().slice(0, 200);

  if (!isVertexAiConfigured()) {
    return {
      model: 'local-rule-fallback',
      location: 'local',
      narrative: buildFallbackA4Narrative({ subjectName: cleanName, subjectNote: cleanNote, purchased, wishlist, analysis })
    };
  }

  try {
    const creds = loadGcpCredentials();
    const projectId = resolveGcpProject(creds);
    const location = (process.env.GCP_LOCATION || 'global').trim();
    const preferredModel = (process.env.VERTEX_AI_MODEL || 'gemini-3.5-flash').trim();
    if (!projectId) throw new Error('缺少 GCP Project ID');

    const accessToken = await getAccessToken();

    const formatItemBrief = (item) => ({
      brandAndName: `${item.brand || ''} ${item.name || ''}`.trim(),
      category: item.category,
      monthlyCost: Math.round(Number(item.monthly_cost || 0)),
      dailyCost: Math.round(Number(item.daily_cost || 0)),
      timing: item.intake_time || item.recommended_timing || '隨餐/飯後',
      absorptionForm: item.absorption_form || '',
      activeSummary: item.active_summary || '',
      valueScore: item.value_score || 80
    });

    const structuredInput = {
      interviewee: {
        name: cleanName,
        backgroundAndMedications: cleanNote || '未特別填寫（一般日常保養）'
      },
      currentlyTaking: purchased.map(formatItemBrief),
      consideringBuying: wishlist.map(formatItemBrief),
      engineMetrics: {
        currentMonthlyCost: analysis.purchasedMonthlyCost || 0,
        wishlistMonthlyCost: analysis.wishlistMonthlyCost || 0,
        potentialMonthlySavings: analysis.potentialMonthlySavings || 0,
        redundancyAlerts: (analysis.redundancyAlerts || []).map((a) => ({
          keep: a.keepProductName,
          drop: a.dropProductName,
          savedMonthly: a.savedMonthly,
          reason: a.reason
        })),
        dosageChecks: (analysis.dosageChecks || []).map((d) => ({
          nutrient: d.name,
          total: `${d.totalAmount}${d.unit}`,
          recommended: `${d.recommended}${d.unit}`,
          ul: `${d.ul}${d.unit}`,
          status: d.statusLabel,
          sources: d.sources
        })),
        timingWarnings: analysis.timingWarnings || []
      }
    };

    // 統一制定的訪談報告 System + User Prompt
    const unifiedPrompt = `你是「好選保健 PurePick」的獨立第三方營養科學分析顧問（100% 中立、不推銷特定品牌、不宣稱醫療療效，嚴格依據台灣衛福部國健署《DRIs 第八版》每日建議量與上限攝取量 UL）。
我們正在進行一對一使用者訪談，請根據以下「受測者現況與系統確定性精算數據」，生成一份能完美排版於「單頁直式 A4 圖文卡片報告」的專業解說 JSON。

【受測者與系統精算輸入資料】：
${JSON.stringify(structuredInput, null, 2)}

【嚴格輸出規則】：
1. 必須只回傳一個合法 JSON 物件，不要任何 Markdown 語法或額外前後綴文字。
2. 所有數字（金額、毫克數、省下金額）必須 100% 忠於輸入資料中的 engineMetrics，絕對不可自行捏造數字或虛構不存在的研調數據。
3. 因為版面嚴格鎖定在「單頁 A4」，每個欄位的繁體中文字數必須精煉、直擊痛點、溫暖好讀，嚴格遵守下方字數上限：

請回傳以下 JSON 結構：
{
  "overallGrade": "必須為 A、B 或 C 三選一（無重複且無超標給 A；有輕微重疊或偏高給 B；有超過 UL 上限或多項嚴重重複浪費給 C）",
  "headline": "24字以內的一句話精準總評標題（例如：精簡 1 款重複葉黃素複方，月省 NT$ 680 更安全）",
  "executiveSummary": "55~85字：結合受測者背景與目前瓶數，總結這套保健組合的整體配置優缺點與預算效益",
  "redundancyNarrative": "60~95字（對應卡片1：重複購買與省錢去冗卡下方說明）：清楚點出哪幾款產品成分重疊、為何建議保留主力款並剔除重複款；若無重複則肯定其跨品類互補配置",
  "dosageSafetyNarrative": "60~95字（對應卡片2：衛福部 DRIs 劑量水位圖卡下方說明）：解讀各營養素總和是否超過或逼近衛福部 UL 安全上限（如脂溶性維生素或鋅），或哪些僅達日常打底劑量",
  "timingNarrative": "55~85字（對應卡片3：早中晚最佳吸收時序卡下方說明）：說明為何依空腹、隨餐飯後、睡前分流服用（例如脂溶性隨餐提升吸收、鈣鐵錯開避免競爭）",
  "doctorAndActionNarrative": "60~95字（對應卡片4：門診溝通與行動建議卡下方說明）：結合受測者背景與成分（如魚油與抗凝血/手術、礦物質與抗生素間隔），給出看診提醒與最優先的 1~2 個具體行動",
  "interviewQuestions": [
    "35字以內：給訪談員現場詢問這位受測者的第 1 個深度追問問題（聚焦重複購買或劑量認知）",
    "35字以內：給訪談員現場詢問這位受測者的第 2 個深度追問問題（聚焦日常執行或看診溝通習慣）"
  ]
}`;

    const modelCandidates = [...new Set([
      preferredModel,
      'gemini-3.5-flash',
      'gemini-3-flash-preview',
      'gemini-2.5-flash-lite'
    ])];

    const apiHost = location === 'global'
      ? 'aiplatform.googleapis.com'
      : `${location}-aiplatform.googleapis.com`;

    let lastError = null;
    for (const model of modelCandidates) {
      const endpoint = `https://${apiHost}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: unifiedPrompt }]
            }
          ],
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            thinkingConfig: {
              thinkingBudget: 256
            }
          }
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const text = parts
          .filter((p) => !p.thought && typeof p.text === 'string')
          .map((p) => p.text)
          .join('')
          .trim();
        if (!text) {
          throw new Error('Vertex AI 回傳空白報告內容');
        }
        const parsed = parseModelJson(text);
        const fallback = buildFallbackA4Narrative({ subjectName: cleanName, subjectNote: cleanNote, purchased, wishlist, analysis });
        const validGrade = ['A', 'B', 'C'].includes(String(parsed.overallGrade || '').toUpperCase())
          ? String(parsed.overallGrade).toUpperCase()
          : fallback.overallGrade;

        return {
          model,
          location,
          narrative: {
            overallGrade: validGrade,
            headline: String(parsed.headline || fallback.headline).trim(),
            executiveSummary: String(parsed.executiveSummary || fallback.executiveSummary).trim(),
            redundancyNarrative: String(parsed.redundancyNarrative || fallback.redundancyNarrative).trim(),
            dosageSafetyNarrative: String(parsed.dosageSafetyNarrative || fallback.dosageSafetyNarrative).trim(),
            timingNarrative: String(parsed.timingNarrative || fallback.timingNarrative).trim(),
            doctorAndActionNarrative: String(parsed.doctorAndActionNarrative || fallback.doctorAndActionNarrative).trim(),
            interviewQuestions: Array.isArray(parsed.interviewQuestions) && parsed.interviewQuestions.length > 0
              ? parsed.interviewQuestions.slice(0, 2).map((q) => String(q || '').trim()).filter(Boolean)
              : fallback.interviewQuestions
          }
        };
      }

      const errMsg = data?.error?.message || `HTTP ${response.status}`;
      lastError = new Error(`Vertex AI (${model}) 報告生成失敗：${errMsg}`);
      if (response.status !== 404) {
        break;
      }
    }

    console.warn('Vertex AI 報告生成降級使用規則備援:', lastError?.message);
    return {
      model: 'local-rule-fallback',
      location: 'local',
      warning: lastError?.message || '',
      narrative: buildFallbackA4Narrative({ subjectName: cleanName, subjectNote: cleanNote, purchased, wishlist, analysis })
    };
  } catch (err) {
    console.warn('Vertex AI 報告生成異常，啟用規則備援:', err.message);
    return {
      model: 'local-rule-fallback',
      location: 'local',
      warning: err.message,
      narrative: buildFallbackA4Narrative({ subjectName: cleanName, subjectNote: cleanNote, purchased, wishlist, analysis })
    };
  }
}

module.exports = {
  isVertexAiConfigured,
  getAccessToken,
  analyzeSupplementImage,
  generateA4InterviewReport
};
