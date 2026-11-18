#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
supplement_analyzer.py
保健食品關鍵字解析、跨品牌成分重疊精算與去冗效益分析引擎
支援兩種模式：
1. mode="finder": 解析使用者自由輸入的困擾文字、勾選項目與預算區間，推薦最合適的營養素與跨品牌商品組合
2. mode="wishlist": 嚴格分析「有興趣清單」與「已購買清單」之間的成分重疊、劑量超標(UL)、吸收衝突，並找出可省錢刪除的冗餘商品
"""

import sys
import json
import re

# 台灣衛福部國人膳食營養素參考攝取量 (DRIs) 與國際臨床保健有效建議量 / 每日上限 (UL)
NUTRIENT_STANDARDS = {
    "omega3": {"name": "Omega-3 (EPA+DHA)", "unit": "mg", "recommended": 1000, "min_effective": 600, "ul": 3000},
    "lutein": {"name": "葉黃素", "unit": "mg", "recommended": 10, "min_effective": 6, "ul": 30},
    "zeaxanthin": {"name": "玉米黃素", "unit": "mg", "recommended": 2, "min_effective": 1.2, "ul": 10},
    "probiotics": {"name": "益生菌活菌數", "unit": "億CFU", "recommended": 200, "min_effective": 100, "ul": 1000},
    "vitamin_b": {"name": "綜合維生素B群", "unit": "%DRIs", "recommended": 100, "min_effective": 80, "ul": 1500},
    "calcium": {"name": "鈣", "unit": "mg", "recommended": 600, "min_effective": 300, "ul": 2500},
    "magnesium": {"name": "鎂", "unit": "mg", "recommended": 200, "min_effective": 100, "ul": 700},
    "vitamin_d": {"name": "維生素D3", "unit": "IU", "recommended": 800, "min_effective": 400, "ul": 2000},
    "vitamin_c": {"name": "維生素C", "unit": "mg", "recommended": 100, "min_effective": 100, "ul": 2000},
    "zinc": {"name": "鋅", "unit": "mg", "recommended": 15, "min_effective": 10, "ul": 35},
    "iron": {"name": "鐵", "unit": "mg", "recommended": 15, "min_effective": 10, "ul": 45},
    "collagen": {"name": "膠原蛋白胜肽", "unit": "mg", "recommended": 5000, "min_effective": 3000, "ul": 15000},
    "gaba": {"name": "GABA / 舒眠萃取", "unit": "mg", "recommended": 100, "min_effective": 50, "ul": 500},
    "uc2": {"name": "非變性二型膠原蛋白(UC-II)", "unit": "mg", "recommended": 40, "min_effective": 40, "ul": 120}
}

# 自由輸入關鍵字與生活困擾對應表
KEYWORD_RULES = [
    {
        "category": "葉黃素",
        "goal_key": "eye",
        "label": "晶亮護眼",
        "keywords": ["眼睛", "眼乾", "乾澀", "螢幕", "電腦", "手機", "追劇", "模糊", "畏光", "疲勞", "酸澀", "近視", "隱形眼鏡", "工程師", "考生", "看書", "飛蚊", "藍光"],
        "advice": "建議選擇「游離型葉黃素」搭配玉米黃素（10:2 比例），每日 6~10mg 即可穩定累積，無須追求 30mg 超高劑量以免增加負擔；若伴隨嚴重乾澀，可搭配高濃度魚油或花青素、蝦紅素。"
    },
    {
        "category": "魚油",
        "goal_key": "cardio",
        "label": "外食循環與思緒清晰",
        "keywords": ["外食", "少吃魚", "油膩", "血脂", "循環", "記憶", "思緒", "專注", "發炎", "三高", "心血管", "膽固醇", "乾眼", "油炸", "便當", "代謝"],
        "advice": "挑選魚油關鍵在於「Omega-3 (EPA+DHA) 實際濃度需達 80% 以上」且為「rTG 吸收型態」。低濃度（30~50%）魚油看似單盒便宜，但每天要吞 3~4 顆且吃進多餘雜油，換算每毫克有效成分反而更貴。"
    },
    {
        "category": "B群",
        "goal_key": "energy",
        "label": "精神體力與熬夜代謝",
        "keywords": ["熬夜", "疲勞", "很累", "沒精神", "想睡", "加班", "體力", "應酬", "喝酒", "壓力", "嘴破", "口角炎", "上班族", "早起", "倦怠", "提神"],
        "advice": "經常熬夜或外食者，建議優先挑選「緩釋型」或「活性型（如 TTFD）」B群，可維持整天穩定代謝，不會吃完兩小時就隨尿液排光。男性可看是否含鋅，女性可看是否含鐵。"
    },
    {
        "category": "益生菌",
        "goal_key": "gut",
        "label": "消化道順暢與調整體質",
        "keywords": ["便秘", "排便", "脹氣", "消化", "拉肚子", "腹瀉", "腸胃", "過敏", "換季", "打噴嚏", "鼻子", "嗯嗯", "肚子", "外食少菜", "青菜", "蔬果"],
        "advice": "挑選益生菌請認明「明確菌株編號」、「保證出廠或效期活菌數（100~300億 CFU 即可）」以及「無添加砂糖、果汁粉、人工香料與瀉藥成分（如番瀉葉、氧化鎂充數）」。"
    },
    {
        "category": "鈣鎂D",
        "goal_key": "bone",
        "label": "骨骼行動力與深層入睡",
        "keywords": ["睡不好", "失眠", "淺眠", "多夢", "難入睡", "半夜醒", "抽筋", "骨頭", "關節", "膝蓋", "咔咔", "長輩", "少喝牛奶", "缺鈣", "焦慮", "緊繃", "咖啡"],
        "advice": "鈣與鎂同時補充（加上維生素 D3 與 K2）不僅能補骨，睡前補充「鎂」更能幫助神經肌肉放鬆、提升睡眠深度。請優先選吸收率高且不脹氣的「海藻鈣」或「檸檬酸鈣」，避開廉價碳酸鈣。"
    },
    {
        "category": "膠原蛋白",
        "goal_key": "beauty",
        "label": "氣色澎潤與基底保養",
        "keywords": ["皮膚", "氣色", "乾燥", "膠原蛋白", "美顏", "暗沉", "細紋", "彈力", "美白", "保養", "愛美"],
        "advice": "膠原蛋白需選擇「小分子二肽/三肽（分子量 < 3000 Da）」且無添加過多糖分香料，並搭配「維生素 C」才能在體內真正合成膠原。"
    }
]

def parse_budget_limit(budget_tier):
    mapping = {
        "under_500": (0, 500),
        "500_1200": (500, 1200),
        "1200_2000": (1200, 2000),
        "2000_3000": (2000, 3000),
        "above_3000": (3000, 99999)
    }
    return mapping.get(budget_tier, (500, 2000))

def analyze_finder(payload):
    free_text = (payload.get("freeText") or "").strip()
    selected_goals = payload.get("goals") or []
    diet = payload.get("diet") or "all"
    form_pref = payload.get("formPref") or "all"
    budget_tier = payload.get("budgetTier") or "1200_2000"
    supplements = payload.get("supplements") or []

    min_budget, max_budget = parse_budget_limit(budget_tier)

    matched_categories = []
    matched_reasons = []
    extracted_keywords = []

    # 1. 從使用者自由輸入文字進行關鍵字掃描
    for rule in KEYWORD_RULES:
        hits = [kw for kw in rule["keywords"] if kw in free_text]
        if hits or (rule["goal_key"] in selected_goals) or (rule["category"] in selected_goals):
            if rule["category"] not in matched_categories:
                matched_categories.append(rule["category"])
            if hits:
                extracted_keywords.extend(hits)
            matched_reasons.append({
                "category": rule["category"],
                "label": rule["label"],
                "matchedKeywords": hits,
                "buyingAdvice": rule["advice"]
            })

    # 若未命中任何特定類別，預設給予現代外食上班族最核心的「魚油 + B群」基礎方案
    if not matched_categories:
        matched_categories = ["魚油", "B群"]
        matched_reasons = [
            {
                "category": "魚油",
                "label": "日常基礎循環保養",
                "matchedKeywords": [],
                "buyingAdvice": KEYWORD_RULES[1]["advice"]
            },
            {
                "category": "B群",
                "label": "日常能量代謝打底",
                "matchedKeywords": [],
                "buyingAdvice": KEYWORD_RULES[2]["advice"]
            }
        ]

    # 檢查素食或特殊需求關鍵字
    is_vegan = (diet == "vegan") or ("吃素" in free_text) or ("素食" in free_text)
    avoid_capsule = (form_pref == "powder") or ("不會吞" in free_text) or ("吞嚥" in free_text)

    # 2. 為每個命中的類別挑選並評分各品牌商品
    category_comparisons = []
    recommended_bundle = []
    running_monthly_cost = 0

    for cat in matched_categories:
        cat_items = [s for s in supplements if s.get("category") == cat]
        if is_vegan:
            vegan_items = [s for s in cat_items if s.get("is_vegan")]
            if vegan_items:
                cat_items = vegan_items

        # 依據綜合效益分數 (value_score) 與每日成本排序
        scored_items = []
        for item in cat_items:
            score = float(item.get("value_score") or 80)
            monthly = float(item.get("monthly_cost") or (float(item.get("daily_cost") or 20) * 30))
            if avoid_capsule and ("粉" in (item.get("dosage_form") or "") or "小顆" in (item.get("dosage_form") or "")):
                score += 8
            # 預算親和度加權
            if monthly <= max_budget / max(1, len(matched_categories)):
                score += 6
            item_copy = dict(item)
            item_copy["computed_score"] = round(score, 1)
            scored_items.append(item_copy)

        scored_items.sort(key=lambda x: (-x["computed_score"], float(x.get("daily_cost") or 999)))

        if scored_items:
            # 挑選符合剩餘預算的最佳單品加入推薦方案組合
            picked = None
            for candidate in scored_items:
                m_cost = float(candidate.get("monthly_cost") or 0)
                if running_monthly_cost + m_cost <= max_budget:
                    picked = candidate
                    break
            if not picked:
                # 挑選該類別中月花費最親民且及格的款式
                affordable = sorted(scored_items, key=lambda x: float(x.get("monthly_cost") or 9999))
                picked = affordable[0]

            if picked:
                running_monthly_cost += float(picked.get("monthly_cost") or 0)
                recommended_bundle.append(picked)

            category_comparisons.append({
                "category": cat,
                "topPickId": picked.get("id") if picked else None,
                "products": scored_items
            })

    # 3. 產生不要亂花錢的良心省錢提醒
    money_saving_tips = []
    if "葉黃素" in matched_categories:
        money_saving_tips.append("葉黃素屬於脂溶性營養素，體內累積需 3~6 個月，每日補充 6~10mg 游離型即足夠，不必買標榜 30mg 卻賣兩三千元的高溢價商品。")
    if "魚油" in matched_categories:
        money_saving_tips.append("買魚油別看單盒總價，請看「每 1000mg Omega-3 實際要花幾元」。濃度低於 50% 的魚油有一半以上是無效油脂，不建議購買。")
    if "膠原蛋白" in matched_categories and "B群" not in matched_categories:
        money_saving_tips.append("若日常飲食維生素 C 攝取不足（少吃芭樂、奇異果），單吃膠原蛋白粉吸收合成率有限，可從天然蔬果補足維生素 C。")
    if running_monthly_cost > max_budget:
        money_saving_tips.append(f"由於您勾選了 {len(matched_categories)} 項保養目標，若全數買齊每月約需 NT$ {int(running_monthly_cost)}，建議先從排名第 1 的核心困擾開始補充即可。")

    return {
        "matchedCategories": matched_categories,
        "extractedKeywords": list(dict.fromkeys(extracted_keywords)),
        "matchedReasons": matched_reasons,
        "budgetRange": {"min": min_budget, "max": max_budget, "tier": budget_tier},
        "recommendedBundle": recommended_bundle,
        "bundleMonthlyCost": int(round(running_monthly_cost)),
        "bundleDailyCost": int(round(running_monthly_cost / 30.0)),
        "categoryComparisons": category_comparisons,
        "moneySavingTips": money_saving_tips
    }

def analyze_wishlist(payload):
    wishlist = payload.get("wishlist") or []
    purchased = payload.get("purchased") or []

    # 1. 統計總花費
    wishlist_monthly_cost = sum(float(x.get("monthly_cost") or 0) for x in wishlist)
    purchased_monthly_cost = sum(float(x.get("monthly_cost") or 0) for x in purchased)

    # 2. 跨商品去冗比對 (「你不需要買 A，因為已經有 B」)
    redundancy_alerts = []
    potential_savings = 0
    flagged_redundant_ids = set()

    # 2A. 先檢查「有興趣商品」是否與「已購買正在吃的商品」重複！
    for w_item in wishlist:
        w_cat = w_item.get("category")
        w_nutrients = json.loads(w_item["nutrients_json"]) if isinstance(w_item.get("nutrients_json"), str) else (w_item.get("nutrients") or {})

        for p_item in purchased:
            p_cat = p_item.get("category")
            p_nutrients = json.loads(p_item["nutrients_json"]) if isinstance(p_item.get("nutrients_json"), str) else (p_item.get("nutrients") or {})

            # 同品類或核心主成分高度重疊
            shared_keys = [k for k in w_nutrients.keys() if k in p_nutrients and float(p_nutrients.get(k) or 0) >= NUTRIENT_STANDARDS.get(k, {}).get("min_effective", 1)]
            if w_cat == p_cat or shared_keys:
                w_cost = int(float(w_item.get("monthly_cost") or 0))
                if w_item.get("id") not in flagged_redundant_ids:
                    flagged_redundant_ids.add(w_item.get("id"))
                    potential_savings += w_cost
                shared_names = "、".join([NUTRIENT_STANDARDS.get(k, {}).get("name", k) for k in shared_keys]) or w_cat
                redundancy_alerts.append({
                    "type": "already_purchased_overlap",
                    "severity": "high",
                    "dropProductId": w_item.get("id"),
                    "dropProductName": f"{w_item.get('brand')} {w_item.get('name')}",
                    "keepProductId": p_item.get("id"),
                    "keepProductName": f"{p_item.get('brand')} {p_item.get('name')}（已在服用日曆中）",
                    "savedMonthly": w_cost,
                    "reason": f"您目前已經購買並正在服用【{p_item.get('brand')} {p_item.get('name')}】，其提供的「{shared_names}」已涵蓋相同保養需求。除非打算吃完換牌子，否則現在不需要再買【{w_item.get('brand')} {w_item.get('name')}】，每月可直接省下 NT$ {w_cost}。"
                })

    # 2B. 檢查「有興趣清單」內部的兩兩重疊與優劣比對
    n = len(wishlist)
    for i in range(n):
        for j in range(i + 1, n):
            item_a = wishlist[i]
            item_b = wishlist[j]
            cat_a = item_a.get("category")
            cat_b = item_b.get("category")
            nut_a = json.loads(item_a["nutrients_json"]) if isinstance(item_a.get("nutrients_json"), str) else (item_a.get("nutrients") or {})
            nut_b = json.loads(item_b["nutrients_json"]) if isinstance(item_b.get("nutrients_json"), str) else (item_b.get("nutrients") or {})

            shared_keys = [k for k in nut_a.keys() if k in nut_b and float(nut_a.get(k) or 0) > 0 and float(nut_b.get(k) or 0) > 0]

            if cat_a == cat_b or len(shared_keys) > 0:
                # 比較誰的綜合效益 (value_score) 更高、每日成本更划算
                score_a = float(item_a.get("value_score") or 75)
                score_b = float(item_b.get("value_score") or 75)
                cost_a = float(item_a.get("daily_cost") or 99)
                cost_b = float(item_b.get("daily_cost") or 99)

                if (score_b > score_a) or (score_b == score_a and cost_b <= cost_a):
                    keep_item, drop_item = item_b, item_a
                else:
                    keep_item, drop_item = item_a, item_b

                drop_monthly = int(float(drop_item.get("monthly_cost") or 0))
                if drop_item.get("id") not in flagged_redundant_ids:
                    flagged_redundant_ids.add(drop_item.get("id"))
                    potential_savings += drop_monthly

                shared_names = "、".join([NUTRIENT_STANDARDS.get(k, {}).get("name", k) for k in shared_keys]) or cat_a
                redundancy_alerts.append({
                    "type": "wishlist_duplicate",
                    "severity": "high" if cat_a == cat_b else "medium",
                    "dropProductId": drop_item.get("id"),
                    "dropProductName": f"{drop_item.get('brand')} {drop_item.get('name')}",
                    "keepProductId": keep_item.get("id"),
                    "keepProductName": f"{keep_item.get('brand')} {keep_item.get('name')}",
                    "savedMonthly": drop_monthly,
                    "reason": f"您可能不需要【{drop_item.get('brand')} {drop_item.get('name')}】，因為您已選了【{keep_item.get('brand')} {keep_item.get('name')}】。兩者皆提供「{shared_names}」，後者的有效成分規格與每元效益比更優（每日僅 NT$ {int(float(keep_item.get('daily_cost') or 0))}），剔除前者每月可省下 NT$ {drop_monthly}，並避免重複攝取。"
                })

    # 3. 彙整所有營養素總攝取量 (有興趣 + 已購買) 並對照 DRIs 與 UL 上限
    combined_items = wishlist + purchased
    nutrient_totals = {}
    nutrient_sources = {}

    for item in combined_items:
        nut = json.loads(item["nutrients_json"]) if isinstance(item.get("nutrients_json"), str) else (item.get("nutrients") or {})
        label = f"{item.get('brand')} {item.get('name')}"
        for k, val in nut.items():
            v = float(val or 0)
            if v <= 0:
                continue
            nutrient_totals[k] = nutrient_totals.get(k, 0.0) + v
            if k not in nutrient_sources:
                nutrient_sources[k] = []
            nutrient_sources[k].append(f"{label} ({v}{NUTRIENT_STANDARDS.get(k, {}).get('unit', '')})")

    dosage_check_list = []
    for k, total_val in nutrient_totals.items():
        std = NUTRIENT_STANDARDS.get(k, {"name": k, "unit": "mg", "recommended": 100, "min_effective": 50, "ul": 1000})
        rec = std["recommended"]
        ul = std["ul"]
        min_eff = std["min_effective"]
        pct_rec = int(round((total_val / rec) * 100)) if rec > 0 else 100

        if total_val > ul:
            status = "exceed_ul"
            status_label = "超過每日上限 (建議刪減)"
        elif len(nutrient_sources.get(k, [])) > 1 and total_val >= rec * 1.6:
            status = "duplicate_high"
            status_label = "多罐重疊偏高"
        elif total_val >= min_eff:
            status = "optimal"
            status_label = "足量達標"
        else:
            status = "low"
            status_label = "劑量偏低 (僅日常打底)"

        dosage_check_list.append({
            "nutrientKey": k,
            "name": std["name"],
            "totalAmount": round(total_val, 1),
            "unit": std["unit"],
            "recommended": rec,
            "ul": ul,
            "percentOfRecommended": pct_rec,
            "status": status,
            "statusLabel": status_label,
            "sources": nutrient_sources.get(k, [])
        })

    # 4. 吸收拮抗與服用時段提醒
    timing_warnings = []
    has_calcium = "calcium" in nutrient_totals
    has_iron = "iron" in nutrient_totals
    has_fish_oil = "omega3" in nutrient_totals
    has_lutein = "lutein" in nutrient_totals
    has_probiotics = "probiotics" in nutrient_totals
    has_b = "vitamin_b" in nutrient_totals

    if has_calcium and has_iron:
        timing_warnings.append("【鈣與鐵吸收互斥】您的清單同時含有「鈣」與「鐵」，兩者會在腸道競爭同一個吸收通道。請務必分開時段服用（例如：早餐後吃鐵、晚餐後或睡前吃鈣）。")
    if has_fish_oil and has_calcium:
        timing_warnings.append("【高劑量魚油與鈣】魚油建議隨餐（午餐或晚餐後）服用以利油脂帶動吸收；鈣鎂建議留在睡前服用，一來避免與油脂產生皂化反應影響吸收，二來能幫助夜間放鬆入睡。")
    if has_lutein and has_fish_oil:
        timing_warnings.append("【魚油＋葉黃素協同增效】魚油與葉黃素皆屬於脂溶性營養素，非常適合一起在「午餐或晚餐飯後」服用，吸收率比空腹吃高出 2 倍以上。")
    if has_probiotics:
        timing_warnings.append("【益生菌服用時機】益生菌建議於早上空腹或睡前搭配常溫水（< 40°C）服用；若有服用抗生素或濃茶咖啡，請至少間隔 1~2 小時。")
    if has_b:
        timing_warnings.append("【B群服用時機】綜合 B 群建議於早餐或午餐後服用，幫助白天能量代謝；避免於深夜睡前服用以免部分人精神過於亢奮。")

    return {
        "wishlistCount": len(wishlist),
        "purchasedCount": len(purchased),
        "wishlistMonthlyCost": int(round(wishlist_monthly_cost)),
        "purchasedMonthlyCost": int(round(purchased_monthly_cost)),
        "potentialMonthlySavings": int(round(potential_savings)),
        "optimizedMonthlyCost": max(0, int(round(wishlist_monthly_cost - potential_savings))),
        "redundancyAlerts": redundancy_alerts,
        "dosageChecks": dosage_check_list,
        "timingWarnings": timing_warnings
    }

def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input:
            print(json.dumps({"error": "No input provided"}))
            return
        payload = json.loads(raw_input)
        mode = payload.get("mode", "finder")
        if mode == "wishlist":
            result = analyze_wishlist(payload)
        else:
            result = analyze_finder(payload)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}, ensure_ascii=False))
        sys.exit(1)

if __name__ == "__main__":
    main()
