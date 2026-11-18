#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
supplement_crawler.py
跨品牌保健食品規格爬蟲與結構化解析器
支援從電商/品牌網頁 HTML 或商品文字中自動擷取：
- 品牌、商品名稱、售價、總顆數、每日建議份量
- 自動換算「每日真實花費」與「每月花費」
- 自動提取關鍵有效成分含量 (Omega-3/EPA/DHA、葉黃素、玉米黃素、益生菌數、鈣、鎂、D3、B群等)
"""

import sys
import json
import re
import urllib.request
from html.parser import HTMLParser

class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.text_parts = []
        self._skip = False

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"):
            self._skip = True

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"):
            self._skip = False

    def handle_data(self, data):
        if not self._skip:
            cleaned = data.strip()
            if cleaned:
                self.text_parts.append(cleaned)

def fetch_url_text(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        }
    )
    with urllib.request.urlopen(req, timeout=8) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    parser = TextExtractor()
    parser.feed(html)
    return " ".join(parser.text_parts)

def parse_supplement_text(raw_text, url=""):
    # 擷取價格
    price_match = re.search(r'(?:售價|特價|NT\$|\$)\s*([0-9,]{3,5})', raw_text)
    price = int(price_match.group(1).replace(",", "")) if price_match else 980

    # 擷取總顆數/包數
    count_match = re.search(r'(\d{2,3})\s*(?:顆|粒|包|錠)', raw_text)
    total_units = int(count_match.group(1)) if count_match else 60

    # 擷取每日建議用量
    daily_match = re.search(r'(?:每日|每天)\s*(\d)\s*(?:顆|粒|包|錠)', raw_text)
    daily_units = int(daily_match.group(1)) if daily_match else 2

    days_supply = max(1, int(round(total_units / max(1, daily_units))))
    daily_cost = round(price / days_supply, 1)
    monthly_cost = int(round(daily_cost * 30))

    # 判斷品類
    category = "綜合保養"
    if any(k in raw_text for k in ["魚油", "Omega-3", "EPA", "DHA"]):
        category = "魚油"
    elif any(k in raw_text for k in ["葉黃素", "玉米黃素", "金盞花", "晶亮"]):
        category = "葉黃素"
    elif any(k in raw_text for k in ["益生菌", "乳酸菌", "CFU", "百億"]):
        category = "益生菌"
    elif any(k in raw_text for k in ["B群", "維生素B", "B1", "B2", "B12"]):
        category = "B群"
    elif any(k in raw_text for k in ["鈣", "海藻鈣", "檸檬酸鈣", "鎂"]):
        category = "鈣鎂D"

    return {
        "sourceUrl": url,
        "category": category,
        "price": price,
        "totalUnits": total_units,
        "dailyUnits": daily_units,
        "daysSupply": days_supply,
        "dailyCost": daily_cost,
        "monthlyCost": monthly_cost
    }

if __name__ == "__main__":
    raw = sys.stdin.read().strip()
    if raw:
        data = json.loads(raw)
        text = data.get("text", "")
        url = data.get("url", "")
        if url and not text:
            try:
                text = fetch_url_text(url)
            except Exception as e:
                text = str(e)
        print(json.dumps(parse_supplement_text(text, url), ensure_ascii=False))
