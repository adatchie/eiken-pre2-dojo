#!/usr/bin/env python3
"""曖昧艦名の正しいWikipediaタイトルを1回のバッチqueryで確定する（429対策）。
存在するページ（pageidあり）だけ報告する。
"""
import json, time, urllib.parse, urllib.request

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"

# ship_id -> 候補タイトル群（正しいものを探索）
CANDIDATES = {
    "dd03 時雨": ["時雨 (駆逐艦)", "時雨 (白露型駆逐艦)", "時雨 (二等駆逐艦)", "時雨"],
    "dd04 響": ["響 (駆逐艦)", "響 (吹雪型駆逐艦)", "響 (暁型駆逐艦)"],
    "dd07 暁": ["暁 (駆逐艦)", "暁 (吹雪型駆逐艦)", "暁 (暁型駆逐艦)"],
    "ca10 利根": ["利根 (重巡洋艦)", "利根 (利根型重巡洋艦)", "利根型重巡洋艦"],
    "cv09 大鳳": ["大鳳 (空母)", "大鳳 (装甲空母)", "大鳳"],
    "dd12 白露": ["白露 (駆逐艦)", "白露 (白露型駆逐艦)"],
}

def api(params, retries=5):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    for a in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and a < retries - 1:
                wait = 20 * (a + 1)
                print(f"  [429] wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise
    return {}

titles = []
for cands in CANDIDATES.values():
    titles.extend(cands)
titles = list(dict.fromkeys(titles))  # 重複除去・順保持

print("querying", len(titles), "titles in one batch...")
data = api({
    "action": "query", "titles": "|".join(titles), "redirects": 1,
})
pages = data.get("query", {}).get("pages", {})
norm = data.get("query", {}).get("normalized", [])
redir = data.get("query", {}).get("redirects", [])
print("\n-- normalized --")
for n in norm:
    print(f"  {n['from']} -> {n['to']}")
print("\n-- redirects --")
for r in redir:
    print(f"  {r['from']} -> {r['to']}")
print("\n-- pages (pageid present = exists) --")
for p in sorted(pages.values(), key=lambda x: x.get("title", "")):
    exists = "pageid" in p
    print(f"  [{'OK ' if exists else 'MISS'}] {p.get('title')}")
