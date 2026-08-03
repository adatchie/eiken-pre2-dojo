// session.js — 逃げ場ゼロの每日セッションエンジン
// queue方式: 不正解の問題はqueue末尾に再投入。全問正解するまで終わらない。
const Session = (() => {
  const KEY = "run_v1";

  function create(itemIds, seedStr, opts = {}) {
    const s = {
      date: U.todayStr(),
      seed: seedStr,
      test: !!opts.test,        // テストモードは再投入なし・報酬なし
      queue: U.seededShuffle(itemIds, seedStr),
      pos: 0,
      correct: 0,
      wrong: 0,
      revealed: 0,
      timeouts: 0,
      done: false,
      rewarded: false,
      finishedAt: null,
      deadline: 0,              // 現問題の制限時間deadline（ms）
      deadlinePos: -1,
      answeredIds: [],
    };
    save(s);
    return s;
  }

  function load() {
    const s = Store.get(KEY, null);
    if (!s || s.date !== U.todayStr() || s.test) return null;
    return s;
  }

  function save(s) { Store.set(KEY, s); }

  function current(s) {
    if (!s || s.done || s.pos >= s.queue.length) return null;
    return s.queue[s.pos];
  }

  function isDone(s) { return !s || s.done || s.pos >= s.queue.length; }

  // isCorrect=false → queue再投入（テストモード以外）。revealed → ミス2回カウント。
  function answer(s, id, isCorrect, opts = {}) {
    if (isCorrect) {
      s.correct++;
      SRS.onCorrect(id);
    } else {
      s.wrong += opts.revealed ? 2 : 1;
      if (opts.revealed) s.revealed++;
      if (opts.timeout) s.timeouts++;
      if (!s.test) {
        // 逃げ場ゼロ: 正解するまで消えない。答え表示(revealed)は2回再出題
        s.queue.push(id);
        if (opts.revealed) s.queue.push(id);
      }
      SRS.onWrong(id);
    }
    s.answeredIds.push(id);
    s.pos++;
    s.deadline = 0;
    s.deadlinePos = -1;
    if (s.pos >= s.queue.length) {
      s.done = true;
      s.finishedAt = Date.now();
    }
    save(s);
    return s;
  }

  function stats(s) {
    const total = s.queue.length;
    return {
      total,
      answered: Math.min(s.pos, total),
      remaining: Math.max(0, total - s.pos),
      correct: s.correct,
      wrong: s.wrong,
      revealed: s.revealed,
      timeouts: s.timeouts,
      done: s.done,
    };
  }

  return { create, load, save, current, isDone, answer, stats, KEY };
})();
