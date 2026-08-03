#!/usr/bin/env python3
"""Extract Eiken Pre-2 words from wordbook-passtan into dojo data format."""
import json

SRC = '/home/adatc/wordbook-passtan/web-prototype/words.json'
DST = '/home/adatc/eiken-pre2-dojo/data/words_pre2.json'

with open(SRC) as f:
    d = json.load(f)

pre2 = [w for w in d['words'] if 'eiken-pre2' in w.get('tags', [])]
out = [{"id": w["id"], "en": w["word"], "ja": w["meaningJa"]} for w in pre2]

with open(DST, 'w') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

ens = [w['en'].lower().strip() for w in out]
print(f"extracted={len(out)} unique={len(set(ens))} dupes={len(ens)-len(set(ens))}")
print(json.dumps(out[:3], ensure_ascii=False, indent=1))
