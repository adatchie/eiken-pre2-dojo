#!/usr/bin/env python3
"""暁・大鳳の記事内画像リストをダンプして、手動で正しいファイルを選べるようにする"""
import json, time, urllib.parse, urllib.request

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"

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
                time.sleep(20 * (a + 1)); continue
            raise
    return {}

for title in ["暁 (暁型駆逐艦)", "大鳳 (空母)"]:
    d = api({"action": "query", "titles": title, "prop": "images", "imlimit": 50})
    pages = d.get("query", {}).get("pages", {})
    for p in pages.values():
        print(f"== {title} ({len(p.get('images', []))} files) ==")
        for im in p.get("images", []):
            print(" ", im.get("title"))
    time.sleep(3)
