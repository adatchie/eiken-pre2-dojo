// srs.js — 間隔反復（簡易SM-2風: 間隔 1→3→7→14→30日）
const SRS = (() => {
  const KEY = "review_v1";
  const INTERVALS = [1, 3, 7, 14, 30];

  function all() { return Store.get(KEY, {}); }
  function save(map) { Store.set(KEY, map); }

  function state(map, id, today) {
    return map[id] || { stage: 0, due: today, ok: 0, bad: 0, introduced: null };
  }

  function introduceMany(ids) {
    const map = all();
    const today = U.todayStr();
    let changed = false;
    ids.forEach((id) => {
      if (!map[id]) {
        map[id] = { stage: 0, due: today, ok: 0, bad: 0, introduced: today };
        changed = true;
      }
    });
    if (changed) save(map);
  }

  function onCorrect(id) {
    const map = all();
    const today = U.todayStr();
    const st = state(map, id, today);
    if (!st.introduced) st.introduced = today;
    st.ok++;
    st.stage = Math.min(st.stage + 1, INTERVALS.length);
    const iv = INTERVALS[Math.min(st.stage - 1, INTERVALS.length - 1)];
    st.due = U.addDays(today, iv);
    map[id] = st;
    save(map);
  }

  function onWrong(id) {
    const map = all();
    const today = U.todayStr();
    const st = state(map, id, today);
    if (!st.introduced) st.introduced = today;
    st.bad++;
    st.stage = 0;
    st.due = U.addDays(today, 1);
    map[id] = st;
    save(map);
  }

  function isDue(map, id, today) {
    const st = map[id];
    return !!st && st.due <= today;
  }

  return { all, save, state, introduceMany, onCorrect, onWrong, isDue, INTERVALS, KEY };
})();
