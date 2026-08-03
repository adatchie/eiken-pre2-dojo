// report.js — 週次テストと保護者リポート
const Report = (() => {
  const TESTKEY = "weektest";
  const WEEK_MS = 7 * 24 * 3600 * 1000;

  // 今週の間違い+SRS期限から20問（なければ弱点優先）
  function buildTestItems(allItems) {
    const map = SRS.all();
    const today = U.todayStr();
    const weak = [];
    for (const it of allItems) {
      const st = map[it.id];
      if (st && st.bad > 0) weak.push({ it, score: st.bad * 10 + (SRS.isDue(map, it.id, today) ? 5 : 0) });
    }
    weak.sort((a, b) => b.score - a.score);
    return weak.slice(0, 20).map((w) => w.it.id);
  }

  function lastTest() { return Store.get(TESTKEY, null); }

  function saveTest(result) { Store.set(TESTKEY, result); }

  function testReady(lastResult) {
    if (!lastResult) return true;
    return Date.now() - lastResult.at >= WEEK_MS;
  }

  function summary(p) {
    const recent = p.history.slice(-7);
    const days = recent.length;
    const correct = recent.reduce((a, r) => a + r.correct, 0);
    const wrong = recent.reduce((a, r) => a + r.wrong, 0);
    const rate = correct + wrong > 0 ? Math.round((correct / (correct + wrong)) * 100) : 0;
    return { days, correct, wrong, rate, streak: p.streak };
  }

  return { buildTestItems, lastTest, saveTest, testReady, summary, TESTKEY };
})();
