// srs.js — 間隔反復（簡易SM-2風: 間隔 1→3→7→14→30日）＋ Lv制（1=書き写し 2=一部表示 3=本番）
const SRS = (() => {
  const KEY = "review_v1";
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

  // 正解: stage上昇＋Lv上昇（最大3）。opts.noLv=テストモード（Lv変動なし）
  function onCorrect(id, opts = {}) {
    const map = all();
    const today = U.todayStr();
    const st = state(map, id, today);
    if (!st.introduced) st.introduced = today;
    st.ok++;
    st.stage = Math.min(st.stage + 1, INTERVALS.length);
    const iv = INTERVALS[Math.min(st.stage - 1, INTERVALS.length - 1)];
    st.due = U.addDays(today, iv);
    if (!opts.noLv) st.lv = Math.min(3, (st.lv || 1) + 1);
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

  return { all, save, state, introduceMany, onCorrect, onWrong, isDue, lvOf, INTERVALS, KEY };
})();
