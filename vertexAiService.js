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

module.exports = {
  isVertexAiConfigured,
  getAccessToken,
  analyzeSupplementImage
};
