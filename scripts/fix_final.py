#!/usr/bin/env python3
"""最終修正: cv09大鳳=Taiho 01.jpg, dd07暁=Commons検索で特定"""
import json, time, urllib.parse, urllib.request, pathlib

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "ships"
CACHE = pathlib.Path(__file__).resolve().parent / ".ship_resolve_cache.json"

def api(base, params, retries=5):
    params = dict(params, format="json")
    url = base + "?" + urllib.parse.urlencode(params)
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

def download(url, dest):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) >= 5000:
                dest.write_bytes(data)
                return len(data)
            return 0
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 3:
                time.sleep(20 * (attempt + 1)); continue
            raise
    return 0

def get_file_url(title):
    d = api(API, {"action": "query", "titles": title, "prop": "imageinfo",
                  "iiprop": "url", "iiurlwidth": 600})
    for p in d.get("query", {}).get("pages", {}).values():
        ii = p.get("imageinfo", [{}])[0]
        return ii.get("thumburl") or ii.get("url")
    return None

cache = json.load(open(CACHE, encoding="utf-8"))

# --- cv09 大鳳: Taiho 01.jpg を直接 ---
url = get_file_url("ファイル:Japanese aircraft carrier Taiho 01.jpg")
time.sleep(3)
if url:
    n = download(url, OUT / "cv09.jpg")
    print(f"[cv09 大鳳] Taiho 01.jpg -> {n} bytes")
    if n:
        cache["cv09"] = {"thumb": url, "title": "大鳳 (空母)"}
else:
    print("[cv09] URL not found")

# --- dd07 暁: Commons検索 ---
time.sleep(3)
d = api(COMMONS, {
    "action": "query", "generator": "search",
    "gsrsearch": "Japanese destroyer Akatsuki 1932", "gsrnamespace": 6, "gsrlimit": 10,
    "prop": "imageinfo", "iiprop": "url", "iiurlwidth": 600,
})
pages = sorted(d.get("query", {}).get("pages", {}).values(), key=lambda p: p.get("index", 99))
print(f"\n[dd07 暁] Commons candidates ({len(pages)}):")
for p in pages:
    t = p.get("title", "")
    ii = p.get("imageinfo", [{}])[0]
    print(f"  - {t}  ({ii.get('thumburl', 'no-url')[:80]})")

# 「Akatsuki」をファイル名に含む最初の実艦写真を選ぶ
best = None
for p in pages:
    t = p.get("title", "")
    if "Akatsuki" in t and not t.lower().endswith(".svg"):
        ii = p.get("imageinfo", [{}])[0]
        u = ii.get("thumburl") or ii.get("url")
        if u:
            best = (t, u)
            break

if best:
    time.sleep(3)
    n = download(best[1], OUT / "dd07.jpg")
    print(f"[dd07 暁] {best[0]} -> {n} bytes")
    if n:
        cache["dd07"] = {"thumb": best[1], "title": "暁 (暁型駆逐艦)"}
else:
    print("[dd07] no Akatsuki image found on Commons")

CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

# manifest再生成
manifest = {sid: cache[sid]["title"] for sid in cache if (OUT / f"{sid}.jpg").exists()}
(OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
print(f"\nmanifest: {len(manifest)}/60")
