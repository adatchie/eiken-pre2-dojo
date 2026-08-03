#!/usr/bin/env python3
"""pageimage未設定の4隻（時雨/暁/利根/大鳳）を記事内画像リストから直接取得する。
手順: 記事のimages一覧 → 艦名を含む適切なファイルを選択 → imageinfoでURL取得 → DL
APIコール最小化 + 429バックオフ付き。
"""
import json, re, time, urllib.parse, urllib.request, pathlib

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project)"
API = "https://ja.wikipedia.org/w/api.php"
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "img" / "ships"
CACHE = pathlib.Path(__file__).resolve().parent / ".ship_resolve_cache.json"

TARGETS = {
    "dd03": ("時雨 (白露型駆逐艦)", "時雨"),
    "dd07": ("暁 (暁型駆逐艦)", "暁"),
    "ca10": ("利根 (重巡洋艦)", "利根"),
    "cv09": ("大鳳 (空母)", "大鳳"),
}

BAD = re.compile(r"flag|emblem|icon|logo|commons-logo|mono|\.svg|map|chart|badge", re.I)

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

def pick_image(images, ship_name):
    """記事の画像リストから最適なものを選ぶ。艦名含む.jpg/.jpeg/.png優先。"""
    cands = []
    for im in images:
        t = im.get("title", "")
        if BAD.search(t):
            continue
        if not re.search(r"\.(jpe?g|png)$", t, re.I):
            continue
        score = 0
        if ship_name in t:
            score += 100
        cands.append((score, t))
    if not cands:
        return None
    cands.sort(key=lambda x: -x[0])
    return cands[0][1]

def main():
    cache = json.load(open(CACHE, encoding="utf-8")) if CACHE.exists() else {}
    fixed = []
    for sid, (title, ship_name) in TARGETS.items():
        # 1) 記事の画像一覧
        d = api({"action": "query", "titles": title, "prop": "images", "imlimit": 50})
        pages = d.get("query", {}).get("pages", {})
        images = []
        for p in pages.values():
            images = p.get("images", [])
        fname = pick_image(images, ship_name)
        if not fname:
            print(f"[NO-IMG] {sid} {title}: {len(images)} images, none suitable")
            print("  all:", [i.get("title") for i in images][:20])
            continue
        time.sleep(3)
        # 2) そのファイルのURL
        d = api({"action": "query", "titles": fname, "prop": "imageinfo",
                 "iiprop": "url|mime", "iiurlwidth": 600})
        pages = d.get("query", {}).get("pages", {})
        info = None
        for p in pages.values():
            ii = p.get("imageinfo", [{}])[0]
            info = ii.get("thumburl") or ii.get("url")
        if not info:
            print(f"[NO-URL] {sid} {fname}")
            continue
        time.sleep(3)
        # 3) ダウンロード
        dest = OUT / f"{sid}.jpg"
        req = urllib.request.Request(info, headers={"User-Agent": UA})
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    data = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 3:
                    wait = 20 * (attempt + 1)
                    print(f"  [DL 429] wait {wait}s", flush=True)
                    time.sleep(wait)
                    continue
                raise
        if len(data) < 5000:
            print(f"[SMALL] {sid}: {len(data)} bytes — skipped")
            continue
        dest.write_bytes(data)
        cache[sid] = {"thumb": info, "title": title}
        fixed.append(sid)
        print(f"[FIXED] {sid} <- {fname} ({len(data)} bytes)")
        time.sleep(1)

    CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=1), encoding="utf-8")

    # manifest再生成（正しい解決結果のみ）
    manifest = {sid: cache[sid]["title"] for sid in cache if (OUT / f"{sid}.jpg").exists()}
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nmanifest: {len(manifest)} entries; fixed: {fixed}")
    missing = [sid for sid in TARGETS if sid not in manifest]
    if missing:
        print("STILL MISSING:", missing)

if __name__ == "__main__":
    main()
