#!/usr/bin/env python3
import json, os, sys
from collections import Counter

base = os.path.join(os.path.dirname(__file__), "..")
p = os.path.join(base, "data", "idioms_pre2.json")
with open(p, encoding="utf-8") as f:
    data = json.load(f)
items = data["items"]
print(f"total items: {len(items)}")
print(f"grade: {data['grade']}")
missing = [it["id"] for it in items if not all(k in it for k in ("id","en","ja","ex","cat","tier","src"))]
print(f"items with missing fields: {len(missing)}")
ens = [it["en"] for it in items]
dups = sorted({e for e in ens if ens.count(e) > 1})
print(f"duplicate en entries: {dups}")
empty_ja = [it["en"] for it in items if not it["ja"].strip()]
empty_ex = [it["en"] for it in items if not it["ex"].strip()]
print(f"empty ja: {empty_ja}")
print(f"empty ex: {empty_ex}")
tiers = Counter(it["tier"] for it in items)
cats = Counter(it["cat"] for it in items)
print(f"tiers: {dict(tiers)}")
print(f"cats: {dict(cats)}")

# check wordbook-passtan pre2 word count
wb_path = "/home/adatc/wordbook-passtan/web-prototype/words.json"
if os.path.exists(wb_path):
    with open(wb_path, encoding="utf-8") as f:
        wb = json.load(f)
    pre2 = [w for w in wb["words"] if "eiken-pre2" in w.get("tags", [])]
    print(f"\nwordbook-passtan pre2 words: {len(pre2)}")
    if pre2:
        print(f"sample: {pre2[0]}")
else:
    print("words.json not found")
