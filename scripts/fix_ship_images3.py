#!/usr/bin/env python3
"""最終修正: 残り6隻を英語版Wikipediaの個別艦記事から取得。"""
import json, re, time, urllib.parse, urllib.request, urllib.error, pathlib

BASE = pathlib.Path("/home/adatc/eiken-pre2-dojo")
UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
EN_API = "https://en.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
OUT_DIR = BASE / "img/ships"

TARGETS = {
    "dd05": ("Japanese destroyer Ikazuchi", ["Ikazuchi", "Ikazuki"]),
    "dd09": ("Japanese destroyer Fubuki", ["Fubuki"]),
    "ca08": ("Japanese cruiser Ashigara", ["Ashigara"]),
    "bb07": ("Japanese battleship Fusō", ["Fuso", "Fusō", "Fusou"]),
    "bb08": ("Japanese battleship Yamashiro", ["Yamashiro"]),
    "ss02": ("Japanese submarine I-401", ["I-401", "I401", "I-401"]),
}
GLOBAL_EXCLUDE = re.compile(r"(Map|Flag|Emblem|Coat_of_arms|Seal|Diagram|Schematic|drawing|Logo|\.svg$|badge|Badge)", re.I)

def api(base, params, retries=4):
    params = dict(params, format="json")
    url = base + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 25 * (attempt + 1)
                print(f"  429, waiting {wait}s", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("429 exhausted")

def get_image(title, tokens):
    data = api(EN_API, {"action": "query", "titles": title, "prop": "images", "imlimit": "500", "redirects": 1})
    pages = data.get("query", {}).get("pages", {})
    names = []
    for p in pages.values():
        names += [im["title"] for im in p.get("images", [])]
    # トークン順でスコアリング
    scored = []
    for n in names:
        fn = n.replace("File:", "")
        if GLOBAL_EXCLUDE.search(fn):
            continue
        for rank, tok in enumerate(tokens):
            if tok.lower() in fn.lower():
                scored.append((rank, n))
                break
    scored.sort(key=lambda x: x[0])
    return [n for _, n in scored]

def download_url(filename):
    # 画像自体はCommonsにあることが多いのでCommons APIで解決
    data = api(COMMONS, {"action": "query", "titles": filename, "prop": "imageinfo",
                          "iiprop": "url|mime", "iiurlwidth": "600"})
    pages = data.get("query", {}).get("pages", {})
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime") in ("image/jpeg", "image/png"):
            return ii.get("thumburl") or ii.get("url"), ii["mime"]
    return None, None

def save(url, mime, sid):
    ext = "png" if mime == "image/png" else "jpg"
    dest = OUT_DIR / f"{sid}.{ext}"
    tmp = OUT_DIR / f".{sid}.new"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = r.read()
    if len(data) < 8000:
        raise RuntimeError(f"too small: {len(data)}")
    tmp.write_bytes(data)
    for old in OUT_DIR.glob(f"{sid}.*"):
        if old.suffix in (".jpg", ".png"):
            old.unlink()
    tmp.rename(dest)
    return dest, len(data)

report = {}
for sid, (title, tokens) in TARGETS.items():
    print(f"\n=== {sid} ({title}) ===", flush=True)
    found = None
    try:
        cands = get_image(title, tokens)
        print(f"  candidates: {cands[:5]}", flush=True)
    except Exception as e:
        print(f"  images failed: {str(e)[:60]}", flush=True)
        cands = []
    for c in cands[:5]:
        try:
            url, mime = download_url(c)
            if not url:
                print(f"  skip (no url/not jpg): {c}", flush=True)
                continue
            dest, size = save(url, mime, sid)
            found = c
            print(f"  SAVED {dest.name} ({size}b)", flush=True)
            break
        except Exception as e:
            print(f"  dl failed {c}: {str(e)[:60]}", flush=True)
        time.sleep(2)
    report[sid] = found
    time.sleep(2)

print("\n=== RESULT ===")
for sid, r in report.items():
    print(sid, "->", r or "NOT FOUND")
