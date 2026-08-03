#!/usr/bin/env python3
"""鑑定NGだった14隻の画像を差し替える。
戦略: 各艦のWikipedia記事の画像一覧から「艦名がファイル名に含まれる」写真を優先取得。
見つからなければCommons検索（"Japanese <艦種> <艦名>"）にフォールバック。
"""
import json, re, time, urllib.parse, urllib.request, urllib.error, pathlib

BASE = pathlib.Path("/home/adatc/eiken-pre2-dojo")
UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"
COMMONS = "https://commons.wikimedia.org/w/api.php"
OUT_DIR = BASE / "img/ships"
CACHE = json.load(open(BASE / "scripts/.ship_resolve_cache.json"))

# 差し替え対象: shipId -> (記事タイトル候補, ファイル名マッチ用トークン, 除外トークン)
TARGETS = {
    "dd04": (["響 (吹雪型駆逐艦)", "響 (駆逐艦)"], ["響", "Hibiki"], []),
    "dd05": (["暁型駆逐艦", "暁 (暁型駆逐艦)"], ["雷", "Ikazuchi", "Ikazuki"], ["暁型"]),
    "dd08": (["綾波 (吹雪型駆逐艦)", "綾波 (駆逐艦)"], ["綾波", "Ayanami"], []),
    "dd09": (["吹雪 (吹雪型駆逐艦)", "吹雪 (駆逐艦)", "吹雪型駆逐艦"], ["吹雪", "Fubuki"], []),
    "dd10": (["陽炎 (陽炎型駆逐艦)", "陽炎型駆逐艦"], ["陽炎", "Kagero", "Kagerō"], []),
    "dd11": (["夕立 (白露型駆逐艦)", "夕立 (駆逐艦)"], ["夕立", "Yudachi", "Yuudachi"], []),
    "dd12": (["白露 (白露型駆逐艦)", "白露型駆逐艦"], ["白露", "Shiratsuyu"], []),
    "cl08": (["夕張 (軽巡洋艦)", "夕張"], ["夕張", "Yubari", "Yuubari"], []),
    "cv01": (["鳳翔 (空母)"], ["鳳翔", "Hosho", "Hōshō"], []),
    "bb07": (["扶桑 (戦艦)"], ["扶桑", "Fuso", "Fusō"], ["扶桑國", "扶桑国"]),
    "bb08": (["山城 (戦艦)"], ["山城", "Yamashiro"], []),
    "ss02": (["伊401 (潜水艦)", "伊号第四百一潜水艦", "伊401"], ["伊401", "I-401", "I401"], []),
}
# 除外するファイル名パターン（地図・旗・図など）
GLOBAL_EXCLUDE = re.compile(r"(Map|map|Flag|flag|Emblem|Coat_of_arms|Seal|Diagram|Plan_|Schematic|drawing|Logo|logo|\.svg$)", re.I)

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
                wait = 20 * (attempt + 1)
                print(f"  429, waiting {wait}s", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("429 retry exhausted")

def article_images(title):
    data = api(API, {"action": "query", "titles": title, "prop": "images", "imlimit": "500", "redirects": 1})
    pages = data.get("query", {}).get("pages", {})
    names = []
    for p in pages.values():
        names += [im["title"] for im in p.get("images", [])]
    return names

def pick(names, tokens, extra_exclude):
    scored = []
    for n in names:
        fn = n.replace("File:", "").replace("ファイル:", "")
        if GLOBAL_EXCLUDE.search(fn):
            continue
        if any(x in fn for x in extra_exclude):
            continue
        for rank, tok in enumerate(tokens):
            if tok.lower() in fn.lower():
                scored.append((rank, n))
                break
    scored.sort(key=lambda x: x[0])
    return [n for _, n in scored]

def download_url(filename, commons=False):
    data = api(COMMONS if commons else API, {
        "action": "query", "titles": filename, "prop": "imageinfo",
        "iiprop": "url|mime", "iiurlwidth": "600"})
    pages = data.get("query", {}).get("pages", {})
    for p in pages.values():
        ii = (p.get("imageinfo") or [{}])[0]
        if ii.get("mime", "").startswith("image/"):
            # jpg/pngのみ（gif等排除）
            if ii["mime"] not in ("image/jpeg", "image/png"):
                return None, None
            return ii.get("thumburl") or ii.get("url"), ii["mime"]
    return None, None

def commons_search(query, tokens):
    data = api(COMMONS, {"action": "query", "list": "search",
                          "srsearch": query, "srnamespace": "6", "srlimit": "20"})
    titles = [r["title"] for r in data.get("query", {}).get("search", [])]
    return pick(titles, tokens, [])

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
    # ダウンロード成功後に初めて旧ファイルと入れ替え（失敗時は現状維持）
    for old in OUT_DIR.glob(f"{sid}.*"):
        if old.suffix in (".jpg", ".png"):
            old.unlink()
    tmp.rename(dest)
    return dest, len(data)

manifest = json.load(open(BASE / "img/ships/manifest.json"))
report = {}
for sid, (titles, tokens, extra_ex) in TARGETS.items():
    print(f"\n=== {sid} ===", flush=True)
    found = None
    # 1) 記事内画像から艦名マッチ
    for t in titles:
        try:
            names = article_images(t)
        except Exception as e:
            print(f"  images({t}) failed: {str(e)[:60]}", flush=True)
            continue
        cands = pick(names, tokens, extra_ex)
        print(f"  [{t}] candidates: {len(cands)} {cands[:3]}", flush=True)
        for c in cands[:4]:
            try:
                url, mime = download_url(c)
                if url:
                    dest, size = save(url, mime, sid)
                    found = (t, c, str(dest))
                    print(f"  SAVED {dest.name} ({size}b) from {c}", flush=True)
                    break
            except Exception as e:
                print(f"  dl failed {c}: {str(e)[:60]}", flush=True)
        if found:
            break
        time.sleep(1.5)
    # 2) Commons検索フォールバック
    if not found:
        q = f"filetype:bitmap {tokens[0]}"
        try:
            cands = commons_search(q, tokens)
            print(f"  commons search: {cands[:3]}", flush=True)
            for c in cands[:3]:
                try:
                    url, mime = download_url(c, commons=True)
                    if url:
                        dest, size = save(url, mime, sid)
                        found = ("commons", c, str(dest))
                        print(f"  SAVED {dest.name} ({size}b) from {c}", flush=True)
                        break
                except Exception as e:
                    print(f"  dl failed {c}: {str(e)[:60]}", flush=True)
        except Exception as e:
            print(f"  commons search failed: {str(e)[:60]}", flush=True)
    report[sid] = found
    time.sleep(1.5)

print("\n=== RESULT ===")
for sid, r in report.items():
    print(sid, "->", r[1] if r else "NOT FOUND")
json.dump(report, open(BASE / "scripts/.fix2_report.json", "w"), ensure_ascii=False, indent=1)
