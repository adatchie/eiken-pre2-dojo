#!/usr/bin/env python3
"""日本語版Wikipediaから連合艦隊60隻のリード画像を取得して img/ships/<id>.jpg に保存する。

- APIコール最小化: タイトル候補を50件単位で一括query（redirects解決込み）
- 未取得の艦だけ generator=search で個別フォールバック
- 画像は pithumbsize=600 のサムネイルURLを直接DL（ローカルリサイズ不要）
"""
import json, sys, time, urllib.parse, urllib.request, pathlib

UA = "EikenPre2Dojo-PrivateCardCollector/1.0 (adatchie personal project; contact: adatchie)"
API = "https://ja.wikipedia.org/w/api.php"
OUT = pathlib.Path(__file__).resolve().parent.parent / "img" / "ships"
OUT.mkdir(parents=True, exist_ok=True)

# id -> 候補タイトル（多い順）。全部失敗したら検索フォールバック。
SHIPS = {
    "dd01": ["雪風 (駆逐艦)", "雪風"],
    "dd02": ["島風 (駆逐艦)", "島風"],
    "dd03": ["時雨 (白露型駆逐艦)", "時雨 (駆逐艦)", "時雨"],
    "dd04": ["響 (吹雪型駆逐艦)", "響 (駆逐艦)", "響"],
    "dd05": ["雷 (駆逐艦)", "雷"],
    "dd06": ["電 (駆逐艦)", "電"],
    "dd07": ["暁 (暁型駆逐艦)", "暁 (駆逐艦)", "暁"],
    "dd08": ["綾波 (駆逐艦)", "綾波"],
    "dd09": ["吹雪 (駆逐艦)", "吹雪"],
    "dd10": ["陽炎 (陽炎型駆逐艦)", "陽炎 (駆逐艦)", "陽炎型駆逐艦", "陽炎"],
    "dd11": ["夕立 (駆逐艦)", "夕立"],
    "dd12": ["白露 (白露型駆逐艦)", "白露 (駆逐艦)", "白露"],
    "dd13": ["秋月 (駆逐艦)", "秋月"],
    "dd14": ["朝潮 (朝潮型駆逐艦)", "朝潮 (駆逐艦)", "朝潮型駆逐艦", "朝潮"],
    "dd15": ["長波 (駆逐艦)", "長波"],
    "dd16": ["初霜 (駆逐艦)", "初霜"],
    "cl01": ["矢矧 (軽巡洋艦)", "矢矧"],
    "cl02": ["能代 (軽巡洋艦)", "能代"],
    "cl03": ["阿武隈 (軽巡洋艦)", "阿武隈"],
    "cl04": ["神通 (軽巡洋艦)", "神通"],
    "cl05": ["北上 (軽巡洋艦)", "北上"],
    "cl06": ["大井 (軽巡洋艦)", "大井"],
    "cl07": ["天龍 (軽巡洋艦)", "天龍"],
    "cl08": ["夕張 (軽巡洋艦)", "夕張"],
    "ca01": ["高雄 (重巡洋艦)", "高雄"],
    "ca02": ["愛宕 (重巡洋艦)", "愛宕"],
    "ca03": ["摩耶 (重巡洋艦)", "摩耶"],
    "ca04": ["鳥海 (重巡洋艦)", "鳥海"],
    "ca05": ["妙高 (重巡洋艦)", "妙高"],
    "ca06": ["羽黒 (重巡洋艦)", "羽黒"],
    "ca07": ["那智 (重巡洋艦)", "那智"],
    "ca08": ["足柄 (重巡洋艦)", "足柄"],
    "ca09": ["最上 (重巡洋艦)", "最上"],
    "ca10": ["利根 (重巡洋艦)", "利根"],
    "ss01": ["伊400 (潜水艦)", "伊号第四百潜水艦", "伊400型潜水艦"],
    "ss02": ["伊401 (潜水艦)", "伊号第四百一潜水艦"],
    "ss03": ["伊168 (潜水艦)", "伊号第百六十八潜水艦", "伊168"],
    "ss04": ["伊58 (潜水艦)", "伊号第五十八潜水艦", "伊58"],
    "cv01": ["鳳翔 (空母)", "鳳翔"],
    "cv02": ["赤城 (空母)", "赤城"],
    "cv03": ["加賀 (空母)", "加賀"],
    "cv04": ["蒼龍 (空母)", "蒼龍"],
    "cv05": ["飛龍 (空母)", "飛龍"],
    "cv06": ["翔鶴 (空母)", "翔鶴"],
    "cv07": ["瑞鶴 (空母)", "瑞鶴"],
    "cv08": ["隼鷹 (空母)", "隼鷹"],
    "cv09": ["大鳳 (空母)", "大鳳"],
    "cv10": ["信濃 (空母)", "信濃"],
    "cv11": ["龍驤 (空母)", "龍驤"],
    "cv12": ["雲龍 (空母)", "雲龍"],
    "bb01": ["長門 (戦艦)", "長門"],
    "bb02": ["陸奥 (戦艦)", "陸奥"],
    "bb03": ["金剛 (戦艦)", "金剛"],
    "bb04": ["比叡 (戦艦)", "比叡"],
    "bb05": ["榛名 (戦艦)", "榛名"],
    "bb06": ["霧島 (戦艦)", "霧島"],
    "bb07": ["扶桑 (戦艦)", "扶桑"],
    "bb08": ["山城 (戦艦)", "山城"],
    "bb09": ["武蔵 (戦艦)", "武蔵"],
    "bb10": ["大和 (戦艦)", "大和"],
}

def api(params, retries=4):
    params = dict(params, format="json")
    url = API + "?" + urllib.parse.urlencode(params)
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 15 * (attempt + 1)
                print(f"  [429] backing off {wait}s...", flush=True)
                time.sleep(wait)
                continue
            raise
    return {}

CACHE = pathlib.Path(__file__).resolve().parent / ".ship_resolve_cache.json"

def load_cache():
    if CACHE.exists():
        try:
            return json.loads(CACHE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_cache(c):
    CACHE.write_text(json.dumps(c, ensure_ascii=False, indent=1), encoding="utf-8")

def download(url, dest, retries=4):
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                data = r.read()
            if len(data) < 5000:
                return False  # 異常に小さい＝エラーページ等
            dest.write_bytes(data)
            return True
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                wait = 20 * (attempt + 1)
                print(f"  [DL 429] backing off {wait}s...", flush=True)
                time.sleep(wait)
                continue
            raise
    return False

# 候補タイトル → ship_id の逆引き（先に出現した候補を優先）
title_to_id = {}
for sid, cands in SHIPS.items():
    for t in cands:
        title_to_id.setdefault(t, sid)

def resolve_batch(titles):
    """一括query。戻り値: {ship_id: {"thumb": url, "title": 正規タイトル}}"""
    found = {}
    params = {
        "action": "query", "prop": "pageimages", "piprop": "thumbnail",
        "pithumbsize": 600, "redirects": 1,
        "titles": "|".join(titles),
    }
    data = api(params)
    pages = data.get("query", {}).get("pages", {})
    for p in pages.values():
        t = p.get("title", "")
        sid = title_to_id.get(t)
        if not sid or sid in found:
            continue
        thumb = p.get("thumbnail", {}).get("source")
        if thumb:
            found[sid] = {"thumb": thumb, "title": t}
    return found

def search_one(name):
    """検索フォールバック: 艦名+艦種で最上位ヒットの画像をもらう"""
    q = name
    params = {
        "action": "query", "generator": "search", "gsrsearch": q, "gsrlimit": 3,
        "prop": "pageimages", "piprop": "thumbnail", "pithumbsize": 600,
        "redirects": 1,
    }
    data = api(params)
    pages = data.get("query", {}).get("pages", {})
    # searchindex順にソート
    ordered = sorted(pages.values(), key=lambda p: p.get("index", 99))
    for p in ordered:
        thumb = p.get("thumbnail", {}).get("source")
        if thumb:
            return {"thumb": thumb, "title": p.get("title", "")}
    return None

def main():
    resolved = load_cache()  # 前回までの解決結果を再利用（APIコール節約）
    need_batch = [t for t in title_to_id if title_to_id[t] not in resolved]
    for i in range(0, len(need_batch), 50):
        batch = need_batch[i:i+50]
        resolved.update(resolve_batch(batch))
        save_cache(resolved)
        time.sleep(3)
    print(f"[batch] {len(resolved)}/{len(SHIPS)} resolved")

    # フォールバック（未取得のみ個別検索・3秒間隔）
    missing = [sid for sid in SHIPS if sid not in resolved]
    for sid in missing:
        ship_name = SHIPS[sid][0].split(" ")[0]  # 「雪風 (駆逐艦)」→「雪風」
        r = search_one(ship_name + " 軍艦") or search_one(ship_name)
        if r:
            resolved[sid] = r
            print(f"[search] {sid} <- {r['title']}")
        else:
            print(f"[MISS] {sid} ({ship_name})")
        save_cache(resolved)
        time.sleep(3)

    # ダウンロード（0.5秒間隔＋429バックオフはdownload側でも）
    ok, fail = [], []
    for sid, info in resolved.items():
        dest = OUT / f"{sid}.jpg"
        if dest.exists() and dest.stat().st_size > 5000:
            ok.append(sid)
            continue
        try:
            if download(info["thumb"], dest):
                ok.append(sid)
            else:
                fail.append(sid)
        except Exception as e:
            print(f"[DL-ERR] {sid}: {e}")
            fail.append(sid)
            time.sleep(10)
        time.sleep(0.5)

    manifest = {sid: resolved[sid]["title"] for sid in ok}
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\nDONE: {len(ok)} downloaded, {len(fail)} failed")
    print("FAIL:", fail if fail else "(none)")
    return 0 if not fail else 1

if __name__ == "__main__":
    sys.exit(main())
