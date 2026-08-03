// util.js — 日付・シード乱数・解答正規化・バリアント展開
const U = (() => {
  function dateStr(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  const todayStr = () => dateStr(new Date());

  function addDays(ds, n) {
    const [y, m, d] = ds.split("-").map(Number);
    return dateStr(new Date(y, m - 1, d + n));
  }

  // FNV-1a hash
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 同じseedStrなら常に同じ順序（同日固定・翌日シャッフルの基盤）
  function seededShuffle(arr, seedStr) {
    const rng = mulberry32(hashStr(seedStr));
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const POSSESSIVES = /\b(my|your|his|her|its|our|their|one's|ones)\b/gi;

  // 解答判定用の正規化: 小文字化・所有格統一・句読点除去・空白圧縮
  function normalize(s) {
    let t = String(s == null ? "" : s).toLowerCase().trim();
    t = t.replace(POSSESSIVES, "one's");
    t = t.replace(/[^a-z0-9' ]/g, " ");
    t = t.replace(/'/g, "");
    t = t.replace(/\s+/g, " ").trim();
    return t;
  }

  function collapse(s) {
    return String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  }

  // 辞書表記のバリアント展開
  //  "word(alt)" → word / alt の2種 (make(earn) a living など)
  //  "(opt)"     → あり/なし の2種 ((just) in case など)
  function expandVariants(en) {
    en = collapse(en);
    const m = en.match(/\(([^()]+)\)/);
    if (!m) return [en];
    const inner = m[1];
    const pre = en.slice(0, m.index);
    const post = en.slice(m.index + m[0].length);
    const out = [];
    const prev = pre.match(/[A-Za-z]+$/);
    if (prev && /^[A-Za-z]+$/.test(inner)) {
      const base = pre.slice(0, prev.index);
      out.push(...expandVariants(base + prev[0] + post));
      out.push(...expandVariants(base + inner + post));
    } else {
      out.push(...expandVariants(pre + inner + post));
      out.push(...expandVariants(pre + post));
    }
    return [...new Set(out)];
  }

  // 項目の受理集合（正規化済み）をキャッシュ付きで返す
  function acceptedSet(item) {
    if (item._accepted) return item._accepted;
    const set = new Set(expandVariants(item.en).map(normalize).filter(Boolean));
    item._accepted = set;
    return set;
  }

  function matchAnswer(input, item) {
    const n = normalize(input);
    return n.length > 0 && acceptedSet(item).has(n);
  }

  return {
    dateStr, todayStr, addDays, hashStr, mulberry32, seededShuffle,
    normalize, collapse, expandVariants, acceptedSet, matchAnswer,
  };
})();
