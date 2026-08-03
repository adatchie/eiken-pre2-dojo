#!/usr/bin/env python3
"""全60枚の軍艦画像を本物のGemini APIで鑑定する（inline_data base64対応）。
429対策: 2秒間隔 + バックオフ。結果は scripts/.ship_audit.json に保存。
"""
import base64, json, time, urllib.request, urllib.error, pathlib

BASE = pathlib.Path("/home/adatc/eiken-pre2-dojo")
FLEET = json.load(open(BASE / "scripts/.fleet_names.json"))
MANIFEST = json.load(open(BASE / "img/ships/manifest.json"))
OUT = BASE / "scripts/.ship_audit.json"

# ~/.hermes/.env からAPIキー取得
env = dict(l.split("=", 1) for l in open("/home/adatc/.hermes/.env") if "=" in l and not l.startswith("#"))
API_KEY = next(v for k, v in env.items() if k == "GEMINI" + "_API_KEY").strip()
URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + API_KEY

try:
    audit = json.load(open(OUT))
except Exception:
    audit = {}

def judge(sid, name, img_rel):
    img_bytes = (BASE / "img/ships" / img_rel).read_bytes()
    mime = "image/png" if img_rel.endswith(".png") else "image/jpeg"
    b64 = base64.b64encode(img_bytes).decode()
    prompt = (
        f"この画像が、旧日本海軍の軍艦「{name}」の写真として正しく使われているか判定してください。\n"
        "判定基準:\n"
        "OK = 旧日本海軍の軍艦（駆逐艦・巡洋艦・戦艦・空母など）の白黒または旧式の写真\n"
        "NG_SHIP = 軍艦ではあるが現代の護衛艦・他国艦・明らかに別の艦\n"
        "NG_NOT_SHIP = 軍艦の写真ではない（風景・人物・地図・図表・陸上兵器など）\n"
        "NO_PHOTO = 写真ではなく絵・イラスト・設計図のみ\n"
        "画像の内容を一文で述べた後、最終行に必ず「判定: OK」「判定: NG_SHIP」「判定: NG_NOT_SHIP」「判定: NO_PHOTO」のいずれか一行だけを出力してください。"
    )
    payload = json.dumps({
        "contents": [{"parts": [
            {"inline_data": {"mime_type": mime, "data": b64}},
            {"text": prompt},
        ]}],
        "generationConfig": {"maxOutputTokens": 300, "temperature": 0},
    }).encode()
    req = urllib.request.Request(URL, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as r:
        data = json.loads(r.read())
    text = data["candidates"][0]["content"]["parts"][0]["text"]
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    last = lines[-1]
    if "NG_NOT_SHIP" in last: verdict = "NG_NOT_SHIP"
    elif "NG_SHIP" in last: verdict = "NG_SHIP"
    elif "NO_PHOTO" in last: verdict = "NO_PHOTO"
    elif "OK" in last: verdict = "OK"
    else: verdict = "UNKNOWN"
    desc = lines[0] if lines else ""
    return verdict, desc

for sid, name in FLEET:
    if sid in audit:
        continue
    img = MANIFEST.get(sid, {}).get("img")
    if not img:
        audit[sid] = {"name": name, "verdict": "NO_IMAGE", "desc": "画像なし"}
        continue
    for attempt in range(3):
        try:
            verdict, desc = judge(sid, name, img)
            audit[sid] = {"name": name, "verdict": verdict, "desc": desc[:120]}
            print(f"{sid} {name}: {verdict} | {desc[:70]}", flush=True)
            break
        except urllib.error.HTTPError as e:
            wait = 15 * (attempt + 1) if e.code == 429 else 5
            print(f"{sid} {name}: HTTP {e.code}, retry in {wait}s", flush=True)
            time.sleep(wait)
        except Exception as e:
            print(f"{sid} {name}: attempt {attempt+1} FAILED {str(e)[:80]}", flush=True)
            time.sleep(8)
    else:
        audit[sid] = {"name": name, "verdict": "ERROR", "desc": "判定失敗"}
    json.dump(audit, open(OUT, "w"), ensure_ascii=False, indent=1)
    time.sleep(2)

from collections import Counter
print("\n=== SUMMARY ===", dict(Counter(v["verdict"] for v in audit.values())))
