// srs.js — 間隔反復（簡易SM-2風: 間隔 1→3→7→14→30日）＋ Lv制（1=一部表示 2=本番）
// 旧Lv1「書き写し」は2026-08に廃止（答えを見ながら打つだけで学習にならないため）
const SRS = (() => {
  const KEY = "review_v1";
  const KEY_MIGRATED = "review_migrated_v2";
  const INTERVALS = [1, 3, 7, 14, 30];

  function all() { return Store.get(KEY, {}); }
  function save(map) { Store.set(KEY, map); }

  function state(map, id, today) {
    return map[id] || { stage: 0, due: today, ok: 0, bad: 0, introduced: null, lv: 1 };
  }

  function introduceMany(ids) {
    const map = all();
    const today = U.todayStr();
    let changed = false;
    ids.forEach((id) => {
      if (!map[id]) {
        map[id] = { stage: 0, due: today, ok: 0, bad: 0, introduced: today, lv: 1 };
        changed = true;
      }
    });
    if (changed) save(map);
  }

  // 正解: stage上昇＋Lv上昇（最大2）。opts.noLv=テストモード（Lv変動なし）
  function onCorrect(id, opts = {}) {
    const map = all();
    const today = U.todayStr();
    const st = state(map, id, today);
    if (!st.introduced) st.introduced = today;
    st.ok++;
    st.stage = Math.min(st.stage + 1, INTERVALS.length);
    const iv = INTERVALS[Math.min(st.stage - 1, INTERVALS.length - 1)];
    st.due = U.addDays(today, iv);
    if (!opts.noLv) st.lv = Math.min(2, (st.lv || 1) + 1);
    map[id] = st;
    save(map);
  }

  // 不正解: stageリセット＋Lv1段階降格（最低1）。opts.noLv=テストモード
  function onWrong(id, opts = {}) {
    const map = all();
    const today = U.todayStr();
    const st = state(map, id, today);
    if (!st.introduced) st.introduced = today;
    st.bad++;
    st.stage = 0;
    st.due = U.addDays(today, 1);
    if (!opts.noLv) st.lv = Math.max(1, (st.lv || 1) - 1);
    map[id] = st;
    save(map);
  }

  function isDue(map, id, today) {
    const st = map[id];
    return !!st && st.due <= today;
  }

  // 項目の現在Lv（未導入は1）
  function lvOf(map, id) {
    const st = map[id];
    return (st && st.lv) || 1;
  }

  // 3段階→2段階への移行（旧Lv1書き写し廃止に伴う、1回だけ実行）
  // 旧Lv3→新Lv2（本番クリア実績は保持）、旧Lv1/2→新Lv1（書き写し昇格は無効化）
  function migrateTo2Lv() {
    if (Store.get(KEY_MIGRATED, false)) return false;
    const map = all();
    Object.keys(map).forEach((id) => {
      const st = map[id];
      if (st && st.lv) st.lv = st.lv >= 3 ? 2 : 1;
    });
    save(map);
    Store.set(KEY_MIGRATED, true);
    return true;
  }

  return { all, save, state, introduceMany, onCorrect, onWrong, isDue, lvOf, migrateTo2Lv, INTERVALS, KEY };
})();
