/**
 * database.js
 * 跨品牌保健食品比較、去冗評估與服用日曆管理平台 - SQLite 資料庫引擎
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.resolve(__dirname, 'data.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('[PurePick DB Error] 資料庫連線失敗:', err.message);
  } else {
    console.log('[PurePick DB] 保健品比較與管理資料庫已連線:', DB_PATH);
  }
});

// 24 款台灣市面主流跨品牌保健食品真實規格資料 (涵蓋高CP值款、知名高單價款、小資打底款、低濃度對照款)
const INITIAL_SUPPLEMENTS = [
  // ==================== 1. 魚油 (Omega-3) ====================
  {
    id: 1,
    brand: '大研生醫',
    name: '德國頂級高濃度魚油 (84%)',
    category: '魚油',
    price: 1320,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 44,
    monthly_cost: 1320,
    dosage_form: '小顆軟膠囊',
    absorption_form: '高吸收型 (好吸收不脹氣)',
    active_summary: '魚油有效成分 1008毫克 (EPA 576毫克 + DHA 384毫克)，濃度 84%',
    nutrients_json: JSON.stringify({ omega3: 1008 }),
    additives_note: '純淨無多餘添加物，德國進口原料',
    value_score: 91,
    pros: '吸收效果好、單顆小好吞服、有效成分達每日 1000 毫克足量標準',
    cons: '單月花費較高，適合預算充足且追求高濃度保養者',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '品牌官網 / 屈臣氏 / momo'
  },
  {
    id: 2,
    brand: '營養師輕食',
    name: '1000頂級高濃度魚油 (85%)',
    category: '魚油',
    price: 1680,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 56,
    monthly_cost: 1680,
    dosage_form: '軟膠囊',
    absorption_form: '高吸收型 (西班牙純淨萃取)',
    active_summary: '魚油有效成分 1120毫克 (EPA 640毫克 + DHA 480毫克)，濃度 85%+',
    nutrients_json: JSON.stringify({ omega3: 1120 }),
    additives_note: '零多餘添加，逐批公開檢驗報告',
    value_score: 93,
    pros: '有效魚油劑量高達 1120 毫克，純度與新鮮度管控極嚴格',
    cons: '膠囊略大顆，每日花費 56 元屬於高階價位',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '品牌官網 / 康是美'
  },
  {
    id: 3,
    brand: '萊萃美 Nature Made',
    name: '高濃度魚油軟膠囊 (60%)',
    category: '魚油',
    price: 899,
    total_units: 100,
    daily_units: 2,
    days_supply: 50,
    daily_cost: 18,
    monthly_cost: 540,
    dosage_form: '大型軟膠囊',
    absorption_form: '一般標準型',
    active_summary: '魚油有效成分 680毫克 (EPA 400毫克 + DHA 280毫克)，濃度約 60%',
    nutrients_json: JSON.stringify({ omega3: 680 }),
    additives_note: '含明膠、甘油、維生素E抗氧化',
    value_score: 84,
    pros: '大罐裝平均每日僅 18 元，很划算，適合日常基礎保養',
    cons: '膠囊很大顆較難吞，濃度 60% 含有約 40% 其他油脂',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '好市多 Costco / 藥妝通路'
  },
  {
    id: 4,
    brand: '科克蘭 Kirkland',
    name: '深海魚油軟膠囊 1000毫克 (30%基礎款)',
    category: '魚油',
    price: 629,
    total_units: 400,
    daily_units: 3,
    days_supply: 133,
    daily_cost: 5,
    monthly_cost: 150,
    dosage_form: '大型軟膠囊',
    absorption_form: '傳統基礎型 (低濃度)',
    active_summary: '每3顆含魚油有效成分 900毫克 (單顆濃度僅 30%)',
    nutrients_json: JSON.stringify({ omega3: 900 }),
    additives_note: '單顆含 700毫克 一般魚脂肪',
    value_score: 68,
    pros: '單價極度便宜，每月不到 200 元',
    cons: '濃度僅 30%，要吃到足量每天得吞 3~4 大顆，且會吃進較多一般油脂',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '好市多 Costco'
  },
  {
    id: 5,
    brand: '達摩本草',
    name: '92% 高濃度好吸收魚油',
    category: '魚油',
    price: 1200,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 40,
    monthly_cost: 1200,
    dosage_form: '迷你軟膠囊',
    absorption_form: '高吸收型',
    active_summary: '魚油有效成分 1050毫克 (EPA 590毫克 + DHA 400毫克)',
    nutrients_json: JSON.stringify({ omega3: 1050 }),
    additives_note: '無多餘香料與色素',
    value_score: 90,
    pros: '高濃度好吸收且每日花費控制在 40 元，相當實惠',
    cons: '通路折扣波動較大，建議趁多盒組購入',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: 'momo / 屈臣氏 / 官網'
  },

  // ==================== 2. 葉黃素 (晶亮護眼) ====================
  {
    id: 6,
    brand: '悠活原力',
    name: '金盞花萃取葉黃素 + 蝦紅素',
    category: '葉黃素',
    price: 980,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 33,
    monthly_cost: 980,
    dosage_form: '軟膠囊',
    absorption_form: 'FloraGLO 游離型葉黃素 (10:2)',
    active_summary: '游離型葉黃素 20mg + 玉米黃素 4mg + 蝦紅素 2mg',
    nutrients_json: JSON.stringify({ lutein: 20, zeaxanthin: 4 }),
    additives_note: '含亞麻仁油基底幫助脂溶性吸收',
    value_score: 92,
    pros: '採用美國專利游離型葉黃素並符合 10:2 比例，另加蝦紅素舒緩酸澀感',
    cons: '軟膠囊含明膠，全素者需選植物膠囊款',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: 'momo / 康是美 / 官網'
  },
  {
    id: 7,
    brand: '白蘭氏',
    name: '黑醋栗＋金盞花葉黃素精華飲',
    category: '葉黃素',
    price: 1680,
    total_units: 24,
    daily_units: 1,
    days_supply: 24,
    daily_cost: 70,
    monthly_cost: 2100,
    dosage_form: '液態玻璃瓶飲',
    absorption_form: '游離型葉黃素 (液態飲)',
    active_summary: '葉黃素 6mg + 玉米黃素 1.2mg + 黑醋栗花青素',
    nutrients_json: JSON.stringify({ lutein: 6, zeaxanthin: 1.2 }),
    additives_note: '含蔗糖、果糖、柑橘果膠、檸檬酸、香料 (每瓶熱量約 32 大卡)',
    value_score: 71,
    pros: '酸甜好喝，適合完全無法吞膠囊的長輩或孩童',
    cons: '葉黃素僅 6mg 但每日花費高達 70 元（每月 2100 元），且含有添加糖分，溢價明顯',
    recommended_timing: '隨餐/飯後',
    is_vegan: 1,
    source_channel: '全聯 / 家樂福 / 屈臣氏'
  },
  {
    id: 8,
    brand: '三多',
    name: '金盞花葉黃素複方軟膠囊',
    category: '葉黃素',
    price: 499,
    total_units: 100,
    daily_units: 1,
    days_supply: 100,
    daily_cost: 5,
    monthly_cost: 150,
    dosage_form: '軟膠囊',
    absorption_form: '酯化型葉黃素 (需消化酵素轉換)',
    active_summary: '酯化型葉黃素 15mg + 維生素A + 鋅 5mg',
    nutrients_json: JSON.stringify({ lutein: 15, zinc: 5 }),
    additives_note: '含大豆油、明膠、食用色素',
    value_score: 77,
    pros: '一盒 100 顆僅 499 元，每天只要 5 元，極致省錢',
    cons: '採用「酯化型」葉黃素，分子量較大，消化機能較弱者吸收率不如游離型，且含人工色素',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '各大藥局 / 屈臣氏 / 全聯'
  },
  {
    id: 9,
    brand: '營養師輕食',
    name: '我的視角葉黃素 (游離型 + 花青素)',
    category: '葉黃素',
    price: 1380,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 46,
    monthly_cost: 1380,
    dosage_form: '植物膠囊',
    absorption_form: 'FloraGLO 游離型 (10:2) + 瑞士山桑子',
    active_summary: '游離型葉黃素 10mg + 玉米黃素 2mg + 山桑子花青素 58mg',
    nutrients_json: JSON.stringify({ lutein: 10, zeaxanthin: 2 }),
    additives_note: '植物膠囊全素可食，無化學色素',
    value_score: 90,
    pros: '除足量 10:2 游離型葉黃素外，花青素含量高，對長時間看螢幕的即時酸澀很有感',
    cons: '單月 1380 元價格偏中高',
    recommended_timing: '隨餐/飯後',
    is_vegan: 1,
    source_channel: '品牌官網'
  },

  // ==================== 3. 益生菌 (消化與體質) ====================
  {
    id: 10,
    brand: '營養師輕食',
    name: '300億機能益生菌 (無添加純淨款)',
    category: '益生菌',
    price: 1450,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 48,
    monthly_cost: 1450,
    dosage_form: '鋁箔粉包',
    absorption_form: '保鮮技術 (保證效期內 300 億活菌)',
    active_summary: '保證活菌數 300億好菌 (含7種公開編號菌株)',
    nutrients_json: JSON.stringify({ probiotics: 300 }),
    additives_note: '100%無添加砂糖、果汁粉、香料、抗結塊劑',
    value_score: 94,
    pros: '完全不加糖粉與香料充數，好菌種類與活菌數完全公開透明',
    cons: '因為無添加調味劑，吃起來是原味微酸粉末，沒有市售乳酸菌的甜味',
    recommended_timing: '早上空腹',
    is_vegan: 1,
    source_channel: '品牌官網 / 康是美'
  },
  {
    id: 11,
    brand: '威德 WEIDER',
    name: '健康益生菌 (顆粒粉包)',
    category: '益生菌',
    price: 899,
    total_units: 90,
    daily_units: 2,
    days_supply: 45,
    daily_cost: 20,
    monthly_cost: 600,
    dosage_form: '粗顆粒粉包',
    absorption_form: '耐酸好菌 + 複合乳酸菌',
    active_summary: '每日2包約 33億好菌 + 膳食纖維',
    nutrients_json: JSON.stringify({ probiotics: 33 }),
    additives_note: '成分前幾名為乳糖、玉米澱粉、蔗糖、檸檬酸、香料',
    value_score: 76,
    pros: '酸甜好吃、單包換算便宜，家庭日常幫助排便順暢容易堅持',
    cons: '出廠菌數較低 (單包 16.5 億)，且含有較多糖分與調味香料',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '好市多 Costco / 藥妝店'
  },
  {
    id: 12,
    brand: '娘家',
    name: '益生菌 (台灣本土專利益生菌)',
    category: '益生菌',
    price: 1800,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 60,
    monthly_cost: 1800,
    dosage_form: '粉包',
    absorption_form: '台灣本土研發單一好菌',
    active_summary: '每日2包共 120億好菌 (台灣本土菌株)',
    nutrients_json: JSON.stringify({ probiotics: 120 }),
    additives_note: '含麥芽糊精、優格香料、甜味劑',
    value_score: 79,
    pros: '國內團隊研發，針對台灣人換季保護力有充足研究',
    cons: '每月需 1800 元價格偏高，且配方含甜味劑與香料',
    recommended_timing: '睡前',
    is_vegan: 0,
    source_channel: '屈臣氏 / 康是美 / 全聯'
  },
  {
    id: 13,
    brand: '達摩本草',
    name: '五國專利 300億益生菌',
    category: '益生菌',
    price: 1090,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 36,
    monthly_cost: 1090,
    dosage_form: '粉包',
    absorption_form: '包埋保護乳酸菌 + 益生菌養分',
    active_summary: '活菌數 300億好菌 + 膳食纖維',
    nutrients_json: JSON.stringify({ probiotics: 300 }),
    additives_note: '無添加人工甜味劑與砂糖',
    value_score: 88,
    pros: '300 億足量好菌且不加糖與人工香料，每日花費 36 元相當平衡',
    cons: '粉末較細，倒入口中建議配常溫水慢吞以免嗆到',
    recommended_timing: '早上空腹',
    is_vegan: 1,
    source_channel: 'momo / 官網'
  },

  // ==================== 4. 綜合維生素 B 群 (精神與代謝) ====================
  {
    id: 14,
    brand: 'DHC',
    name: '維他命B群 (日常基礎款)',
    category: 'B群',
    price: 250,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 8,
    monthly_cost: 250,
    dosage_form: '迷你錠劑',
    absorption_form: '一般水溶性B群',
    active_summary: 'B1 40毫克、B2 30毫克、B6 30毫克、B12、葉酸 (約每日建議量 3~10 倍)',
    nutrients_json: JSON.stringify({ vitamin_b: 300 }),
    additives_note: '含植物纖維素、澱粉',
    value_score: 87,
    pros: '每日僅 8 元極度便宜、顆粒超小好吞、包裝輕便好攜帶',
    cons: '非長效型，水溶性 B 群約 2~3 小時即隨尿液排出，下午容易覺得精神消退',
    recommended_timing: '隨餐/飯後',
    is_vegan: 1,
    source_channel: '7-11 / 全家 / 屈臣氏 / 康是美'
  },
  {
    id: 15,
    brand: '克補 Stresstabs',
    name: 'B群＋鋅 (男性強化配方) / B群＋鐵',
    category: 'B群',
    price: 699,
    total_units: 90,
    daily_units: 1,
    days_supply: 90,
    daily_cost: 8,
    monthly_cost: 233,
    dosage_form: '膜衣錠',
    absorption_form: '高劑量B群 + 礦物質',
    active_summary: '完整B群 (每日建議量 3 倍) + 維生素C 500毫克 + 鋅 15毫克 + 維生素E',
    nutrients_json: JSON.stringify({ vitamin_b: 300, vitamin_c: 500, zinc: 15 }),
    additives_note: '外層膜衣含食用色素',
    value_score: 85,
    pros: '一錠同時補足高劑量 B 群、維生素 C 與 15 毫克足量鋅，每天不到 8 元',
    cons: '外層含有食用色素，且空腹吃較容易有B群氣味反胃感，務必飯後吃',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '好市多 / 屈臣氏 / 各大藥局'
  },
  {
    id: 16,
    brand: 'BHK\'s',
    name: '璨研維他命B群＋鐵 (長效慢釋型)',
    category: 'B群',
    price: 590,
    total_units: 60,
    daily_units: 1,
    days_supply: 60,
    daily_cost: 10,
    monthly_cost: 295,
    dosage_form: '長效膜衣錠',
    absorption_form: '8~10小時長效慢慢釋放 + 好吸收鐵',
    active_summary: '長效B群 (每日建議量 1.5 倍) + 好吸收鐵 10毫克',
    nutrients_json: JSON.stringify({ vitamin_b: 150, iron: 10 }),
    additives_note: '含長效釋放植物外層',
    value_score: 90,
    pros: '長效設計能讓 B 群在 8 小時內慢慢釋放，不浪費且整天精神穩定，鐵質溫和不刺激',
    cons: '含有鐵質，不可與鈣片在同一餐服用以免互相影響吸收',
    recommended_timing: '隨餐/飯後',
    is_vegan: 1,
    source_channel: '官網 / 屈臣氏 / momo'
  },
  {
    id: 17,
    brand: '大研生醫',
    name: 'B群長效雙層錠 (含五味子與牛磺酸)',
    category: 'B群',
    price: 750,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 25,
    monthly_cost: 750,
    dosage_form: '雙層長效錠',
    absorption_form: '速溶層 + 8小時慢慢釋放層',
    active_summary: '完整B群 (每日建議量 2 倍) + 鋅 12毫克 + 五味子 + 牛磺酸',
    nutrients_json: JSON.stringify({ vitamin_b: 200, zinc: 12 }),
    additives_note: '無人工防腐劑',
    value_score: 86,
    pros: '雙層設計兼顧早上快速提振與下午長效續航，適合高壓加班族',
    cons: '每月 750 元較一般 B 群貴約 2~3 倍',
    recommended_timing: '隨餐/飯後',
    is_vegan: 1,
    source_channel: '官網 / momo'
  },

  // ==================== 5. 鈣鎂D (骨骼與深層睡眠) ====================
  {
    id: 18,
    brand: '達摩本草',
    name: '愛爾蘭海洋鎂＋海藻鈣 (含D3與K2)',
    category: '鈣鎂D',
    price: 790,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 26,
    monthly_cost: 790,
    dosage_form: '植物膠囊',
    absorption_form: 'Aquamin-F 天然海藻鈣 + 海洋鎂',
    active_summary: '鈣 450mg + 鎂 150mg + 維生素D3 400IU + K2',
    nutrients_json: JSON.stringify({ calcium: 450, magnesium: 150, vitamin_d: 400 }),
    additives_note: '天然植物與海洋萃取，全素可食',
    value_score: 93,
    pros: '海藻鈣吸收率高且完全不脹氣，搭配鎂、D3、K2 形成完整補骨與睡前放鬆配方',
    cons: '每天需吃 2~3 顆才能達到高鈣需求',
    recommended_timing: '睡前',
    is_vegan: 1,
    source_channel: 'momo / 屈臣氏 / 官網'
  },
  {
    id: 19,
    brand: '萊萃美 Nature Made',
    name: '鈣＋鎂＋鋅＋維生素D3 綜合錠',
    category: '鈣鎂D',
    price: 689,
    total_units: 300,
    daily_units: 2,
    days_supply: 150,
    daily_cost: 5,
    monthly_cost: 140,
    dosage_form: '大型錠劑',
    absorption_form: '碳酸鈣 + 氧化鎂',
    active_summary: '鈣 666mg + 鎂 266mg + 鋅 10mg + 維生素D3 400IU',
    nutrients_json: JSON.stringify({ calcium: 666, magnesium: 266, zinc: 10, vitamin_d: 400 }),
    additives_note: '以碳酸鈣與氧化鎂為主',
    value_score: 74,
    pros: '價格超低，一罐可吃 5 個月，每月只要 140 元',
    cons: '採用成本最低的「碳酸鈣」與「氧化鎂」，吸收率偏低，且碳酸鈣遇胃酸易產生二氧化碳導致胃脹氣或打嗝',
    recommended_timing: '隨餐/飯後',
    is_vegan: 0,
    source_channel: '好市多 Costco'
  },
  {
    id: 20,
    brand: '悠活原力',
    name: '海藻鈣＋鎂錠 (雙效好眠骨力配方)',
    category: '鈣鎂D',
    price: 680,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 23,
    monthly_cost: 680,
    dosage_form: '錠劑',
    absorption_form: '愛爾蘭海藻鈣 + 海洋鎂 + 維生素D3',
    active_summary: '鈣 500mg + 鎂 160mg + 維生素D3 600IU',
    nutrients_json: JSON.stringify({ calcium: 500, magnesium: 160, vitamin_d: 600 }),
    additives_note: '無人工色素',
    value_score: 91,
    pros: '海藻鈣與海洋鎂比例佳，維生素 D3 達 600IU，睡前吃幫助入睡且價格親民',
    cons: '錠劑表面較無甜味膜衣，需配足量溫水吞服',
    recommended_timing: '睡前',
    is_vegan: 1,
    source_channel: '康是美 / momo / 官網'
  },
  {
    id: 21,
    brand: '挺立 Caltrate',
    name: '關鍵迷你錠 (UC-II 非變性二型膠原蛋白)',
    category: '鈣鎂D',
    price: 1190,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 40,
    monthly_cost: 1190,
    dosage_form: '迷你錠',
    absorption_form: 'UC-II 專利非變性二型膠原 + 維生素C',
    active_summary: 'UC-II 40mg + 維生素C 45mg + 鎂 + 鋅 + 銅 + 錳',
    nutrients_json: JSON.stringify({ uc2: 40, vitamin_c: 45, magnesium: 50, zinc: 5 }),
    additives_note: '含食用色素藍色二號鋁麗基',
    value_score: 85,
    pros: '專攻長輩與運動族「關節軟骨靈活度」，每天 1 小顆即可達 40mg 臨床有效 UC-II 劑量',
    cons: '注意：這款是保養「關節軟骨(UC-II)」，幾乎不含鈣質！若想補骨密度需選海藻鈣而非此款',
    recommended_timing: '早上空腹',
    is_vegan: 0,
    source_channel: '屈臣氏 / 康是美 / 各大藥局'
  },

  // ==================== 6. 膠原蛋白與美妍舒眠 ====================
  {
    id: 22,
    brand: '明治 Meiji',
    name: '膠原蛋白粉 (標準罐裝/袋裝)',
    category: '膠原蛋白',
    price: 799,
    total_units: 28,
    daily_units: 1,
    days_supply: 28,
    daily_cost: 29,
    monthly_cost: 855,
    dosage_form: '散裝粉末 (附湯匙)',
    absorption_form: '5000mg 魚來源低分子膠原胜肽',
    active_summary: '低分子魚膠原蛋白 5000mg + 維生素C 50mg + 葡萄糖胺',
    nutrients_json: JSON.stringify({ collagen: 5000, vitamin_c: 50 }),
    additives_note: '含糊精、香料、甜味劑壓制腥味',
    value_score: 86,
    pros: '每份足量 5000mg 魚膠原且已內含 50mg 維生素 C 輔助合成，價格實在',
    cons: '袋裝需自己用湯匙挖且含微幅香料，建議加入豆漿或咖啡飲用',
    recommended_timing: '早上空腹',
    is_vegan: 0,
    source_channel: '屈臣氏 / 康是美 / 好市多'
  },
  {
    id: 23,
    brand: 'BHK\'s',
    name: '裸耀膠原蛋白錠 (小分子胜肽)',
    category: '膠原蛋白',
    price: 690,
    total_units: 60,
    daily_units: 2,
    days_supply: 30,
    daily_cost: 23,
    monthly_cost: 690,
    dosage_form: '膜衣錠',
    absorption_form: '法國專利魚膠原胜肽 + 玻尿酸',
    active_summary: '魚膠原胜肽 1200mg + 維生素C 60mg',
    nutrients_json: JSON.stringify({ collagen: 1200, vitamin_c: 60 }),
    additives_note: '含食用紅色色素膜衣',
    value_score: 75,
    pros: '做成錠劑完全不用忍受膠原蛋白粉的魚腥味，方便攜帶',
    cons: '因為錠劑容量有限，每天 2 顆僅有 1200mg 膠原蛋白（粉包通常有 5000mg），有效劑量偏低',
    recommended_timing: '睡前',
    is_vegan: 0,
    source_channel: '屈臣氏 / 官網'
  },
  {
    id: 24,
    brand: '營養師輕食',
    name: '國民海藻鈣＋海洋鎂＋GABA 舒眠粉包',
    category: '鈣鎂D',
    price: 1180,
    total_units: 30,
    daily_units: 1,
    days_supply: 30,
    daily_cost: 39,
    monthly_cost: 1180,
    dosage_form: '獨立粉包',
    absorption_form: '海藻鈣 + 海洋鎂 + 日本專利 GABA',
    active_summary: '鈣 520mg + 鎂 150mg + 維生素D3 400IU + GABA 100mg',
    nutrients_json: JSON.stringify({ calcium: 520, magnesium: 150, vitamin_d: 400, gaba: 100 }),
    additives_note: '無添加蔗糖與人工香料，粉包好吞服',
    value_score: 92,
    pros: '專為「吞膠囊困難」與「淺眠易醒族」設計，一次補足海藻鈣、鎂與 100mg 足量 GABA',
    cons: '單月 1180 元比純鈣鎂膠囊略高約 300 元',
    recommended_timing: '睡前',
    is_vegan: 1,
    source_channel: '品牌官網'
  }
];

function initDatabase() {
  db.serialize(() => {
    // 1. LINE 登入使用者資料表
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT DEFAULT 'line',
        provider_id TEXT UNIQUE,
        display_name TEXT NOT NULL,
        picture_url TEXT,
        family_role TEXT DEFAULT '消費者',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 2. 跨品牌保健食品標準資料庫
    db.run(`
      CREATE TABLE IF NOT EXISTS supplements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand TEXT NOT NULL,
        name TEXT NOT NULL,
        category TEXT NOT NULL,
        price INTEGER NOT NULL,
        total_units INTEGER DEFAULT 60,
        daily_units INTEGER DEFAULT 2,
        days_supply INTEGER DEFAULT 30,
        daily_cost REAL NOT NULL,
        monthly_cost INTEGER NOT NULL,
        dosage_form TEXT,
        absorption_form TEXT,
        active_summary TEXT,
        nutrients_json TEXT DEFAULT '{}',
        additives_note TEXT,
        value_score INTEGER DEFAULT 85,
        pros TEXT,
        cons TEXT,
        recommended_timing TEXT DEFAULT '隨餐/飯後',
        is_vegan INTEGER DEFAULT 0,
        source_channel TEXT DEFAULT '市售通路',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 3. 使用者清單管理表 (分兩邊：status = 'wishlist' 有興趣清單 / status = 'purchased' 已購買清單)
    db.run(`
      CREATE TABLE IF NOT EXISTS user_supplements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        supplement_id INTEGER NOT NULL,
        status TEXT NOT NULL, -- 'wishlist' 或 'purchased'
        intake_time TEXT DEFAULT '隨餐/飯後',
        started_date TEXT,
        remaining_days INTEGER DEFAULT 30,
        user_name TEXT DEFAULT '示範使用者',
        line_user_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 4. 服用日曆與身體狀態日誌表 (像月經日曆一樣記錄每日打卡與身體反饋)
    db.run(`
      CREATE TABLE IF NOT EXISTS calendar_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date_str TEXT UNIQUE NOT NULL, -- YYYY-MM-DD
        taken_ids_json TEXT DEFAULT '[]', -- 當日已打勾服用的 supplement_id 陣列
        energy_level TEXT DEFAULT '', -- '精神飽滿' | '狀態平穩' | '疲倦想睡'
        digestion_status TEXT DEFAULT '', -- '排便順暢' | '稍微脹氣' | '排便不順'
        sleep_eye_status TEXT DEFAULT '', -- '睡眠深沉' | '晶亮舒適' | '眼睛乾酸'
        note TEXT DEFAULT '',
        updated_by TEXT DEFAULT '示範使用者',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 5. 潛在消費者名單登記表 (Lead Capture / Waitlist 候補登記)
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        age TEXT DEFAULT '',
        contact_type TEXT DEFAULT 'email', -- 'line' | 'email' | 'phone'
        contact_value TEXT NOT NULL,
        line_user_id TEXT DEFAULT '',
        health_goal TEXT DEFAULT '',
        monthly_budget TEXT DEFAULT '',
        satisfaction_score INTEGER DEFAULT 5, -- 流程順暢度 1~5 分
        note TEXT DEFAULT '',
        source TEXT DEFAULT 'web_feedback_pro',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, () => {
      // 確保現有資料庫亦具備 satisfaction_score, age, line_user_id 欄位
      db.run('ALTER TABLE leads ADD COLUMN satisfaction_score INTEGER DEFAULT 5', () => {});
      db.run('ALTER TABLE leads ADD COLUMN age TEXT DEFAULT ""', () => {});
      db.run('ALTER TABLE leads ADD COLUMN line_user_id TEXT DEFAULT ""', () => {});
      seedSupplementCatalog();
    });
  });
}

initDatabase();

function seedSupplementCatalog() {
  db.get('SELECT COUNT(*) as count FROM supplements', [], (err, row) => {
    if (err) return;
    if (!row || row.count === 0) {
      injectDefaultData();
    } else {
      // 同步更新白話文商品說明（去除專業術語縮寫）
      const updateStmt = db.prepare(`
        UPDATE supplements
        SET name = ?, dosage_form = ?, absorption_form = ?, active_summary = ?, additives_note = ?, pros = ?, cons = ?
        WHERE id = ?
      `);
      for (const s of INITIAL_SUPPLEMENTS) {
        updateStmt.run([s.name, s.dosage_form, s.absorption_form, s.active_summary, s.additives_note, s.pros, s.cons, s.id]);
      }
      updateStmt.finalize();
    }
  });
}

function injectDefaultData(callback) {
  db.serialize(() => {
    db.run('DELETE FROM supplements');
    db.run('DELETE FROM user_supplements');
    db.run('DELETE FROM calendar_logs');

    const stmt = db.prepare(`
      INSERT INTO supplements (
        id, brand, name, category, price, total_units, daily_units, days_supply,
        daily_cost, monthly_cost, dosage_form, absorption_form, active_summary,
        nutrients_json, additives_note, value_score, pros, cons,
        recommended_timing, is_vegan, source_channel
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const s of INITIAL_SUPPLEMENTS) {
      stmt.run([
        s.id, s.brand, s.name, s.category, s.price, s.total_units, s.daily_units, s.days_supply,
        s.daily_cost, s.monthly_cost, s.dosage_form, s.absorption_form, s.active_summary,
        s.nutrients_json, s.additives_note, s.value_score, s.pros, s.cons,
        s.recommended_timing, s.is_vegan, s.source_channel
      ]);
    }
    stmt.finalize();

    // 預設注入「有興趣清單 (wishlist)」：故意包含重疊品項以展示「不需要買 A 因為已經有 B」的嚴格分析
    const defaultWishlist = [
      { supplement_id: 2, status: 'wishlist', intake_time: '隨餐/飯後' }, // 營養師輕食 1000魚油 (與已購買的大研魚油重疊！)
      { supplement_id: 6, status: 'wishlist', intake_time: '隨餐/飯後' }, // 悠活原力 游離型葉黃素
      { supplement_id: 7, status: 'wishlist', intake_time: '隨餐/飯後' }, // 白蘭氏 葉黃素精華飲 (與悠活原力葉黃素重疊，且溢價高！)
      { supplement_id: 18, status: 'wishlist', intake_time: '睡前' }     // 達摩本草 海洋鎂+海藻鈣
    ];

    // 預設注入「已購買清單 (purchased)」：目前正在吃、顯示於服用日曆的 3 款保健品
    const defaultPurchased = [
      { supplement_id: 1, status: 'purchased', intake_time: '隨餐/飯後', remaining_days: 22 }, // 大研生醫 德國頂級魚油
      { supplement_id: 10, status: 'purchased', intake_time: '早上空腹', remaining_days: 18 }, // 營養師輕食 300億益生菌
      { supplement_id: 16, status: 'purchased', intake_time: '隨餐/飯後', remaining_days: 45 }  // BHK's 緩釋B群+鐵
    ];

    const uStmt = db.prepare(`
      INSERT INTO user_supplements (supplement_id, status, intake_time, started_date, remaining_days, user_name)
      VALUES (?, ?, ?, date('now', '-10 days'), ?, '官方示範帳號')
    `);

    for (const w of defaultWishlist) {
      uStmt.run([w.supplement_id, w.status, w.intake_time, 30]);
    }
    for (const p of defaultPurchased) {
      uStmt.run([p.supplement_id, p.status, p.intake_time, p.remaining_days]);
    }
    uStmt.finalize();

    // 注入當月近 10 天的日曆打卡與身體狀態記錄，讓月曆一打開就像真實使用中的經期/健康日曆
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const todayDate = now.getDate();

    const sampleNotes = [
      { offset: -7, taken: [1, 10, 16], energy: '狀態平穩', digestion: '排便順暢', sleep: '晶亮舒適', note: '按時吃完三款，下午工作精神還不錯' },
      { offset: -6, taken: [1, 10, 16], energy: '精神飽滿', digestion: '排便順暢', sleep: '睡眠深沉', note: '早上空腹吃益生菌很順暢' },
      { offset: -5, taken: [1, 16], energy: '狀態平穩', digestion: '稍微脹氣', sleep: '晶亮舒適', note: '早上趕出門忘記吃益生菌，外食便當偏油' },
      { offset: -4, taken: [1, 10, 16], energy: '精神飽滿', digestion: '排便順暢', sleep: '睡眠深沉', note: '恢復規律補充，睡眠品質穩定' },
      { offset: -3, taken: [1, 10, 16], energy: '精神飽滿', digestion: '排便順暢', sleep: '晶亮舒適', note: '看電腦一整天，眼睛狀態比上週好' },
      { offset: -2, taken: [10, 16], energy: '疲倦想睡', digestion: '排便順暢', sleep: '眼睛乾酸', note: '趕報告熬夜到兩點，晚餐後忘了吃魚油' },
      { offset: -1, taken: [1, 10, 16], energy: '精神飽滿', digestion: '排便順暢', sleep: '睡眠深沉', note: '今日三款全部準時打勾完成！' },
      { offset: 0, taken: [10, 16], energy: '精神飽滿', digestion: '排便順暢', sleep: '晶亮舒適', note: '早餐前已吃益生菌、午餐後已吃緩釋B群，待晚餐後吃魚油' }
    ];

    const cStmt = db.prepare(`
      INSERT OR REPLACE INTO calendar_logs (
        date_str, taken_ids_json, energy_level, digestion_status, sleep_eye_status, note, updated_by
      ) VALUES (?, ?, ?, ?, ?, ?, '官方示範帳號')
    `);

    for (const item of sampleNotes) {
      const d = todayDate + item.offset;
      if (d >= 1 && d <= 28) {
        const dStr = `${year}-${month}-${String(d).padStart(2, '0')}`;
        cStmt.run([
          dStr,
          JSON.stringify(item.taken),
          item.energy,
          item.digestion,
          item.sleep,
          item.note
        ]);
      }
    }
    cStmt.finalize((err) => {
      if (callback) callback(err);
    });
  });
}

function clearUserPersonalData() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('DELETE FROM user_supplements');
      db.run('DELETE FROM calendar_logs', (err) => {
        if (err) return reject(err);
        resolve(true);
      });
    });
  });
}

function restoreDemoData() {
  return new Promise((resolve, reject) => {
    injectDefaultData((err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

const dbQuery = {
  all: (sql, params = []) => new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  }),
  get: (sql, params = []) => new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  }),
  run: (sql, params = []) => new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  })
};

module.exports = {
  db,
  dbQuery,
  INITIAL_SUPPLEMENTS,
  clearUserPersonalData,
  restoreDemoData
};
