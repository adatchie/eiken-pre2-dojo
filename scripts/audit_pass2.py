#!/usr/bin/env python3
"""第2パス: UNKNOWN判定のみ再鑑定。判定行を先に出力 + トークン余裕。"""
import base64, json, time, urllib.request, urllib.error, pathlib

BASE = pathlib.Path("/home/adatc/eiken-pre2-dojo")
MANIFEST = json.load(open(BASE / "img/ships/manifest.json"))
OUT = BASE / "scripts/.ship_audit.json"
audit = json.load(open(OUT))

env = dict(l.split("=", 1) for l in open("/home/adatc/.hermes/.env") if "=" in l and not l.startswith("#"))
API_KEY = next(v for k, v in env.items() if k == "GEMINI" + "_API_KEY").strip()
URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY

def judge(name, img_rel):
    img_bytes = (BASE / "img/ships" / img_rel).read_bytes()
    mime = "image/png" if img_rel.endswith(".png") else "image/jpeg"
    b64 = base64.b64encode(img_bytes).decode()
    prompt = (
        f"これは旧日本海軍の軍艦「{name}」の写真として使えますか？\n"
        "最初に必ず一行で、以下のいずれかだけを出力:\n"
        "判定: OK / 判定: NG_SHIP / 判定: NG_NOT_SHIP / 判定: NO_PHOTO\n"
        "OK=旧日本海軍の軍艦の古い白黒写真。NG_SHIP=軍艦だが現代護衛艦・他国艦など別物。"
        "NG_NOT_SHIP=軍艦でない写真（風景・人物・地図・資料画像等）。NO_PHOTO=絵・イラストのみ。\n"
        "判定行の後に、写っている内容を一行で説明してください。"
    )
    payload = json.dumps({
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime, "data": b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {"maxOutputTokens": 600, "temperature": 0},
    }).encode()
    req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read())
    text = data["candidates"][0]["content"]["parts"][0]["text"].strip()
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    first = lines[0] if lines else ""
    if "NG_NOT_SHIP" in first: verdict = "NG_NOT_SHIP"
    elif "NG_SHIP" in first: verdict = "NG_SHIP"
    elif "NO_PHOTO" in first: verdict = "NO_PHOTO"
    elif "OK" in first: verdict = "OK"
    else: verdict = "UNKNOWN"
    desc = lines[1] if len(lines) > 1 else text[:80]
    return verdict, desc

targets = [sid for sid, v in audit.items() if v["verdict"] in ("UNKNOWN", "ERROR")]
print(f"re-judging {len(targets)} images", flush=True)
for sid in targets:
    name = audit[sid]["name"]
    img = MANIFEST.get(sid, {}).get("img")
    for attempt in range(3):
        try:
            verdict, desc = judge(name, img)
            audit[sid]["verdict"] = verdict
            audit[sid]["desc"] = desc[:150]
            print(f"{sid} {name}: {verdict} | {desc[:60]}", flush=True)
            break
        except urllib.error.HTTPError as e:
            wait = 15 * (attempt + 1) if e.code == 429 else 5
            print(f"{sid}: HTTP {e.code}, retry {wait}s", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"{sid}: FAILED {str(e)[:60]}", flush=True)
            time.sleep(8)
    json.dump(audit, open(OUT, "w"), ensure_ascii=False, indent=1)
    time.sleep(2)

from collections import Counter
print("\n=== FINAL ===", dict(Counter(v["verdict"] for v in audit.values())))
