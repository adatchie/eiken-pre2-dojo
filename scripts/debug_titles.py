#!/usr/bin/env python3
"""問題の4タイトルを直接queryして、返却される全フィールドをダンプする"""
import json, time, urllib.parse, urllib.request

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"
TITLES = ["時雨 (白露型駆逐艦)", "暁 (暁型駆逐艦)", "利根 (重巡洋艦)", "大鳳 (空母)"]

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
                print(f"[429] wait {wait}s", flush=True)
                time.sleep(wait)
                continue
            raise
    return {}

data = api({
    "action": "query", "prop": "pageimages|info",
    "piprop": "thumbnail|name", "pithumbsize": 600,
    "titles": "|".join(TITLES), "redirects": 1,
})
print(json.dumps(data, ensure_ascii=False, indent=1))
