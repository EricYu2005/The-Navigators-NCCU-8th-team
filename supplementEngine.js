/**
 * supplementEngine.js
 * 跨品牌保健食品需求解析、成分重疊精算與去冗效益評估引擎
 * 結合：
 * 1. Python 關鍵字與營養素劑量精算腳本 (scripts/supplement_analyzer.py)
 * 2. 嚴格的 LLM 深度評估 (支援 Google Gemini / Groq / Ollama 雲端與本地推理)
 */

require('dotenv').config();
const { spawn } = require('child_process');
const path = require('path');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';

const PYTHON_SCRIPT_PATH = path.resolve(__dirname, 'scripts', 'supplement_analyzer.py');

// 台灣衛福部 DRIs 與上限攝取量 (作為 JS 雙重保障)
const NUTRIENT_STANDARDS = {
  omega3: { name: '魚油有效成分 (Omega-3)', unit: '毫克', recommended: 1000, min_effective: 600, ul: 3000 },
  lutein: { name: '葉黃素', unit: '毫克', recommended: 10, min_effective: 6, ul: 30 },
  zeaxanthin: { name: '玉米黃素', unit: '毫克', recommended: 2, min_effective: 1.2, ul: 10 },
  probiotics: { name: '益生菌好菌數', unit: '億好菌', recommended: 200, min_effective: 100, ul: 1000 },
  vitamin_b: { name: '綜合維生素B群', unit: '% 每日建議量', recommended: 100, min_effective: 80, ul: 1500 },
  calcium: { name: '鈣', unit: '毫克', recommended: 600, min_effective: 300, ul: 2500 },
  magnesium: { name: '鎂', unit: '毫克', recommended: 200, min_effective: 100, ul: 700 },
  vitamin_d: { name: '維生素D3', unit: '單位(IU)', recommended: 800, min_effective: 400, ul: 2000 },
  vitamin_c: { name: '維生素C', unit: '毫克', recommended: 100, min_effective: 100, ul: 2000 },
  zinc: { name: '鋅', unit: '毫克', recommended: 15, min_effective: 10, ul: 35 },
  iron: { name: '鐵', unit: '毫克', recommended: 15, min_effective: 10, ul: 45 },
  collagen: { name: '膠原蛋白', unit: '毫克', recommended: 5000, min_effective: 3000, ul: 15000 },
  gaba: { name: '幫助入睡成分 (GABA)', unit: '毫克', recommended: 100, min_effective: 50, ul: 500 },
  uc2: { name: '關節靈活保養膠原', unit: '毫克', recommended: 40, min_effective: 40, ul: 120 }
};

/**
 * 執行 Python 分析腳本 (自動偵測 python 或 python3)
 */
function runPythonAnalyzer(payload) {
  return new Promise((resolve) => {
    const trySpawn = (cmd, onFail) => {
      let stdout = '';
      let stderr = '';
      let finished = false;

      let proc;
      try {
        proc = spawn(cmd, [PYTHON_SCRIPT_PATH], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
        });
      } catch (err) {
        return onFail();
      }

      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          try { proc.kill(); } catch (e) {}
          onFail();
        }
      }, 4500);

      proc.stdout.on('data', (chunk) => {
        stdout += chunk.toString('utf8');
      });
      proc.stderr.on('data', (chunk) => {
        stderr += chunk.toString('utf8');
      });
      proc.on('error', () => {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          onFail();
        }
      });
      proc.on('close', (code) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout.trim());
            if (!parsed.error) {
              return resolve(parsed);
            }
          } catch (e) {}
        }
        onFail();
      });

      try {
        proc.stdin.write(JSON.stringify(payload));
        proc.stdin.end();
      } catch (e) {
        if (!finished) {
          finished = true;
          clearTimeout(timer);
          onFail();
        }
      }
    };

    trySpawn('python', () => {
      trySpawn('python3', () => {
        // 若雲端容器未安裝 Python runtime，使用內建同步精算邏輯
        resolve(runJsFallbackAnalyzer(payload));
      });
    });
  });
}

/**
 * 當雲端環境無 Python 執行檔時的同步等效精算器
 */
function runJsFallbackAnalyzer(payload) {
  if (payload.mode === 'wishlist') {
    const wishlist = payload.wishlist || [];
    const purchased = payload.purchased || [];
    const wishlistMonthlyCost = wishlist.reduce((acc, x) => acc + Number(x.monthly_cost || 0), 0);
    const purchasedMonthlyCost = purchased.reduce((acc, x) => acc + Number(x.monthly_cost || 0), 0);

    const redundancyAlerts = [];
    let potentialSavings = 0;
    const flaggedIds = new Set();

    const getNut = (item) => {
      if (item.nutrients && typeof item.nutrients === 'object') return item.nutrients;
      try { return JSON.parse(item.nutrients_json || '{}'); } catch (e) { return {}; }
    };

    for (const w of wishlist) {
      const wNut = getNut(w);
      for (const p of purchased) {
        const pNut = getNut(p);
        const shared = Object.keys(wNut).filter(k => pNut[k] && Number(pNut[k]) >= (NUTRIENT_STANDARDS[k]?.min_effective || 1));
        if (w.category === p.category || shared.length > 0) {
          const wCost = Math.round(Number(w.monthly_cost || 0));
          if (!flaggedIds.has(w.id)) {
            flaggedIds.add(w.id);
            potentialSavings += wCost;
          }
          const sharedNames = shared.map(k => NUTRIENT_STANDARDS[k]?.name || k).join('、') || w.category;
          redundancyAlerts.push({
            type: 'already_purchased_overlap',
            severity: 'high',
            dropProductId: w.id,
            dropProductName: `${w.brand} ${w.name}`,
            keepProductId: p.id,
            keepProductName: `${p.brand} ${p.name}（已在服用日曆中）`,
            savedMonthly: wCost,
            reason: `您目前已經購買並正在服用【${p.brand} ${p.name}】，其提供的「${sharedNames}」已涵蓋相同保養需求。除非打算吃完換牌子，否則現在不需要再買【${w.brand} ${w.name}】，每月可直接省下 NT$ ${wCost}。`
          });
        }
      }
    }

    for (let i = 0; i < wishlist.length; i++) {
      for (let j = i + 1; j < wishlist.length; j++) {
        const a = wishlist[i];
        const b = wishlist[j];
        const nutA = getNut(a);
        const nutB = getNut(b);
        const shared = Object.keys(nutA).filter(k => Number(nutA[k] || 0) > 0 && Number(nutB[k] || 0) > 0);
        if (a.category === b.category || shared.length > 0) {
          const scoreA = Number(a.value_score || 75);
          const scoreB = Number(b.value_score || 75);
          const [keep, drop] = scoreB >= scoreA ? [b, a] : [a, b];
          const dropCost = Math.round(Number(drop.monthly_cost || 0));
          if (!flaggedIds.has(drop.id)) {
            flaggedIds.add(drop.id);
            potentialSavings += dropCost;
          }
          const sharedNames = shared.map(k => NUTRIENT_STANDARDS[k]?.name || k).join('、') || a.category;
          redundancyAlerts.push({
            type: 'wishlist_duplicate',
            severity: a.category === b.category ? 'high' : 'medium',
            dropProductId: drop.id,
            dropProductName: `${drop.brand} ${drop.name}`,
            keepProductId: keep.id,
            keepProductName: `${keep.brand} ${keep.name}`,
            savedMonthly: dropCost,
            reason: `您可能不需要【${drop.brand} ${drop.name}】，因為您已選了【${keep.brand} ${keep.name}】。兩者皆提供「${sharedNames}」，後者的有效成分規格與每元效益比更優（每日僅 NT$ ${Math.round(Number(keep.daily_cost || 0))}），剔除前者每月可省下 NT$ ${dropCost}，並避免重複攝取。`
          });
        }
      }
    }

    const combined = [...wishlist, ...purchased];
    const totals = {};
    const sources = {};
    for (const item of combined) {
      const nut = getNut(item);
      for (const [k, v] of Object.entries(nut)) {
        const num = Number(v || 0);
        if (num <= 0) continue;
        totals[k] = (totals[k] || 0) + num;
        if (!sources[k]) sources[k] = [];
        sources[k].push(`${item.brand} ${item.name} (${num}${NUTRIENT_STANDARDS[k]?.unit || ''})`);
      }
    }

    const dosageChecks = Object.entries(totals).map(([k, totalVal]) => {
      const std = NUTRIENT_STANDARDS[k] || { name: k, unit: 'mg', recommended: 100, min_effective: 50, ul: 1000 };
      const pct = Math.round((totalVal / std.recommended) * 100);
      let status = 'optimal';
      let statusLabel = '足量達標';
      if (totalVal > std.ul) {
        status = 'exceed_ul';
        statusLabel = '超過每日上限 (建議刪減)';
      } else if ((sources[k]?.length || 0) > 1 && totalVal >= std.recommended * 1.6) {
        status = 'duplicate_high';
        statusLabel = '多罐重疊偏高';
      } else if (totalVal < std.min_effective) {
        status = 'low';
        statusLabel = '劑量偏低 (僅日常打底)';
      }
      return {
        nutrientKey: k,
        name: std.name,
        totalAmount: Math.round(totalVal * 10) / 10,
        unit: std.unit,
        recommended: std.recommended,
        ul: std.ul,
        percentOfRecommended: pct,
        status,
        statusLabel,
        sources: sources[k] || []
      };
    });

    const timingWarnings = [];
    if (totals.calcium && totals.iron) {
      timingWarnings.push('【鈣與鐵吸收互斥】您的清單同時含有「鈣」與「鐵」，兩者會在腸道競爭吸收。請務必分開時段服用（如早餐後吃鐵、睡前吃鈣）。');
    }
    if (totals.omega3 && totals.lutein) {
      timingWarnings.push('【魚油＋葉黃素協同吸收】魚油與葉黃素皆屬脂溶性，建議一起於「午餐或晚餐飯後」服用，吸收率最佳。');
    }
    if (totals.probiotics) {
      timingWarnings.push('【益生菌服用時段】建議於早上空腹或睡前搭配常溫水服用。');
    }

    return {
      wishlistCount: wishlist.length,
      purchasedCount: purchased.length,
      wishlistMonthlyCost: Math.round(wishlistMonthlyCost),
      purchasedMonthlyCost: Math.round(purchasedMonthlyCost),
      potentialMonthlySavings: Math.round(potentialSavings),
      optimizedMonthlyCost: Math.max(0, Math.round(wishlistMonthlyCost - potentialSavings)),
      redundancyAlerts,
      dosageChecks,
      timingWarnings
    };
  }

  // Finder fallback
  const freeText = (payload.freeText || '').trim();
  const goals = payload.goals || [];
  const budgetTier = payload.budgetTier || '1200_2000';
  const supplements = payload.supplements || [];
  const budgetLimits = {
    under_500: [0, 500],
    '500_1200': [500, 1200],
    '1200_2000': [1200, 2000],
    '2000_3000': [2000, 3000],
    above_3000: [3000, 99999]
  };
  const [minB, maxB] = budgetLimits[budgetTier] || [1200, 2000];

  const rules = [
    { category: '葉黃素', key: 'eye', label: '晶亮護眼', kws: ['眼', '螢幕', '電腦', '手機', '乾澀', '酸'], advice: '建議選擇好吸收的游離型葉黃素搭配玉米黃素 10:2 比例，每日 6~10 毫克即可穩定補充。' },
    { category: '魚油', key: 'cardio', label: '外食循環與思緒', kws: ['外食', '魚', '油', '循環', '血脂', '思緒', '專注'], advice: '建議挑選有效成分濃度達 80% 以上的高吸收型魚油，避免買到低濃度一般油脂。' },
    { category: 'B群', key: 'energy', label: '精神體力與代謝', kws: ['累', '熬夜', '疲勞', '精神', '加班', '體力', '嘴破'], advice: '建議挑選長效慢慢釋放的 B 群，維持整天精神與體力。' },
    { category: '益生菌', key: 'gut', label: '消化道順暢', kws: ['便秘', '排便', '脹氣', '消化', '腸胃', '過敏', '換季'], advice: '選擇公開好菌種類、無添加砂糖與輕瀉成分、好菌數 100~300 億即可。' },
    { category: '鈣鎂D', key: 'bone', label: '骨骼行動與舒眠', kws: ['睡', '失眠', '淺眠', '抽筋', '骨', '關節', '長輩'], advice: '海藻鈣搭配鎂與維生素 D3 於睡前補充，兼顧補鈣與夜間放鬆好眠。' },
    { category: '膠原蛋白', key: 'beauty', label: '氣色澎潤保養', kws: ['皮膚', '氣色', '膠原', '美顏'], advice: '選擇小分子好吸收且無糖配方，並搭配日常維生素 C 攝取。' }
  ];

  const matchedCategories = [];
  const matchedReasons = [];
  const extractedKeywords = [];

  for (const r of rules) {
    const hits = r.kws.filter(k => freeText.includes(k));
    if (hits.length > 0 || goals.includes(r.key) || goals.includes(r.category)) {
      matchedCategories.push(r.category);
      extractedKeywords.push(...hits);
      matchedReasons.push({ category: r.category, label: r.label, matchedKeywords: hits, buyingAdvice: r.advice });
    }
  }
  if (matchedCategories.length === 0) {
    matchedCategories.push('魚油', 'B群');
    matchedReasons.push(
      { category: '魚油', label: '外食基礎循環', matchedKeywords: [], buyingAdvice: rules[1].advice },
      { category: 'B群', label: '日常精神體力', matchedKeywords: [], buyingAdvice: rules[2].advice }
    );
  }

  let runningCost = 0;
  const recommendedBundle = [];
  const categoryComparisons = [];

  for (const cat of matchedCategories) {
    const items = supplements
      .filter(s => s.category === cat)
      .sort((a, b) => Number(b.value_score || 0) - Number(a.value_score || 0));
    if (items.length > 0) {
      let picked = items.find(it => runningCost + Number(it.monthly_cost || 0) <= maxB) || items[items.length - 1];
      runningCost += Number(picked.monthly_cost || 0);
      recommendedBundle.push(picked);
      categoryComparisons.push({ category: cat, topPickId: picked.id, products: items });
    }
  }

  return {
    matchedCategories,
    extractedKeywords,
    matchedReasons,
    budgetRange: { min: minB, max: maxB, tier: budgetTier },
    recommendedBundle,
    bundleMonthlyCost: Math.round(runningCost),
    bundleDailyCost: Math.round(runningCost / 30),
    categoryComparisons,
    moneySavingTips: ['買保健品請看「每日實際花費」與「有效成分達標率」，單盒便宜但有效濃度過低的商品反而最花冤枉錢。']
  };
}

/**
 * 呼叫嚴格 LLM (Gemini / Groq / Ollama) 進行深度個人化文字解析
 */
async function callStrictLLM(systemPrompt, userPrompt, timeoutMs = 10000) {
  // 1. 優先嘗試 Google Gemini API
  if (GEMINI_API_KEY) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) return JSON.parse(text);
      }
    } catch (e) {
      clearTimeout(timer);
    }
  }

  // 2. 嘗試 Groq 雲端 API
  if (GROQ_API_KEY) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return JSON.parse(text);
      }
    } catch (e) {
      clearTimeout(timer);
    }
  }

  // 3. 嘗試本地 Ollama
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: `${systemPrompt}\n\n${userPrompt}`,
        stream: false,
        format: 'json',
        options: { temperature: 0.2 }
      }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data.response) return JSON.parse(data.response);
    }
  } catch (e) {
    clearTimeout(timer);
  }

  return null;
}

/**
 * 整合分析一：【尋找】互動表單與自由輸入需求解析
 */
async function evaluateFinderSolution({ freeText, goals, diet, formPref, budgetTier, supplements }) {
  // 1. 先執行 Python 關鍵字與預算商品比對
  const pyResult = await runPythonAnalyzer({
    mode: 'finder',
    freeText,
    goals,
    diet,
    formPref,
    budgetTier,
    supplements
  });

  // 2. 若使用者有輸入自由描述或勾選目標，呼叫嚴格 LLM 產出個人化深度點評
  const systemPrompt = `你是一位完全站在消費者立場、不收廠商廣告費的專業營養師與保健品精算顧問。
請根據消費者的「自由描述生活困擾」、「勾選需求」與「每月預算」，給出誠實、精準、不誇大且幫消費者省錢的購買指南。
注意：絕對不要在文字中出現任何技術名詞（如AI、模型、演算法、LLM等）。請直接輸出 JSON 格式：
{
  "personalizedSummary": "針對使用者的生活狀況，用溫暖直白的口吻說明最優先該補充什麼、為什麼，以及日常飲食可以怎麼配合（約 80~130 字）",
  "dontWasteMoneyOn": "明確告訴這位消費者『不需要花冤枉錢買什麼規格或哪種商品』（約 40~70 字）"
}`;

  const budgetLabels = {
    under_500: '每月 NT$ 500 以下',
    '500_1200': '每月 NT$ 500 ~ 1,200',
    '1200_2000': '每月 NT$ 1,200 ~ 2,000',
    '2000_3000': '每月 NT$ 2,000 ~ 3,000',
    above_3000: '每月 NT$ 3,000 以上'
  };

  const userPrompt = `
消費者自述狀況：${freeText || '未填寫自由文字，僅勾選項目'}
命中保養類別：${(pyResult.matchedCategories || []).join('、')}
飲食偏好：${diet === 'vegan' ? '素食' : '一般飲食'}
每月預算區間：${budgetLabels[budgetTier] || budgetTier}
系統精算推薦組合總月費：NT$ ${pyResult.bundleMonthlyCost}/月
推薦商品：${(pyResult.recommendedBundle || []).map(x => `${x.brand} ${x.name} ($${x.monthly_cost}/月)`).join('、')}
`;

  const llmAdvice = await callStrictLLM(systemPrompt, userPrompt, 7000);

  const defaultSummary = freeText
    ? `根據您描述的「${freeText.slice(0, 38)}${freeText.length > 38 ? '...' : ''}」，系統為您鎖定【${(pyResult.matchedCategories || []).join('＋')}】作為核心保養方案。在您的預算區間（${budgetLabels[budgetTier] || ''}）內，我們篩選出有效成分達標且每日單價最合理的跨品牌組合，每月合計僅需 NT$ ${pyResult.bundleMonthlyCost}（平均每天 NT$ ${pyResult.bundleDailyCost}）。`
    : `根據您選擇的保養目標【${(pyResult.matchedCategories || []).join('＋')}】與預算設定（${budgetLabels[budgetTier] || ''}），我們從各品牌中挑出有效濃度最高、無多餘添加物且每元效益比最划算的方案，每月總花費約 NT$ ${pyResult.bundleMonthlyCost}。`;

  const defaultDontWaste = (pyResult.moneySavingTips && pyResult.moneySavingTips[0])
    || '不需要購買單盒看似便宜但有效成分濃度過低、或是添加大量果汁粉與賦形劑的商品；先從最核心的 1~2 項足量補充即可。';

  return {
    ...pyResult,
    personalizedSummary: llmAdvice?.personalizedSummary || defaultSummary,
    dontWasteMoneyOn: llmAdvice?.dontWasteMoneyOn || defaultDontWaste
  };
}

/**
 * 整合分析二：【管理 - 有興趣清單】嚴格重疊去冗分析
 */
async function evaluateWishlistPortfolio({ wishlist, purchased }) {
  // 1. 執行 Python 嚴格成分重疊、DRIs/UL 劑量檢核與去冗省錢精算
  const pyResult = await runPythonAnalyzer({
    mode: 'wishlist',
    wishlist,
    purchased
  });

  if (wishlist.length === 0 && purchased.length === 0) {
    return {
      ...pyResult,
      overallVerdict: '目前尚未加入考慮購買商品。請先至「尋找」挑選商品，系統將為您比對重複與精算開銷。'
    };
  }

  // 2. 呼叫嚴格 LLM 針對目前的「有興趣清單 + 已購買清單」進行總體審視（精簡摘要，控制在 40~60 字以內）
  const systemPrompt = `你是一位嚴格替消費者把關荷包與劑量安全的保健品精算師。
請檢視消費者「考慮購買（有興趣）」與「已經購買正在吃」的保健品清單，給出一段簡明俐落、聚焦核心的總評結論（字數請精簡控制在 40~60 字以內，不超過 2 句話）。
重點：
1. 若有重複：直接點出發現幾處重複，建議剔除哪款多餘商品，每個月可省下多少錢。
2. 若無重複：簡明說明挑選商品配置均衡無重複、花費合理。
注意：不可贅述過多細項數據（留給下方詳細報告），不可出現任何技術名詞（如 AI、LLM、Python 等）。請輸出 JSON 格式：
{
  "overallVerdict": "精簡總評結論"
}`;

  const userPrompt = `
【考慮購買（有興趣清單）】：${wishlist.map(x => `${x.brand} ${x.name} (${x.category}, $${x.monthly_cost}/月, 核心成分:${x.active_summary})`).join('；') || '無'}
【已購買（正在吃）】：${purchased.map(x => `${x.brand} ${x.name} (${x.category}, $${x.monthly_cost}/月, 核心成分:${x.active_summary})`).join('；') || '無'}
【精算發現的重複品項】：${(pyResult.redundancyAlerts || []).map(a => a.reason).join(' ')}
【每月可省下金額】：NT$ ${pyResult.potentialMonthlySavings}
`;

  const llmVerdict = await callStrictLLM(systemPrompt, userPrompt, 7000);

  let defaultVerdict = '';
  if ((pyResult.redundancyAlerts || []).length > 0) {
    defaultVerdict = `比對發現共有 ${pyResult.redundancyAlerts.length} 處成分重疊，建議依照下方提示剔除重複商品，每月可直接省下 NT$ ${pyResult.potentialMonthlySavings}。`;
  } else if (wishlist.length > 0) {
    defaultVerdict = `目前挑選的 ${wishlist.length} 款商品配置均衡無重複，主要成分皆在每日建議範圍內，每月預計花費 NT$ ${pyResult.wishlistMonthlyCost}。`;
  } else {
    defaultVerdict = `目前服用中共 ${purchased.length} 款商品。加入新商品時系統將自動比對重複並精算荷包。`;
  }

  return {
    ...pyResult,
    overallVerdict: llmVerdict?.overallVerdict || defaultVerdict
  };
}

module.exports = {
  evaluateFinderSolution,
  evaluateWishlistPortfolio,
  NUTRIENT_STANDARDS
};
