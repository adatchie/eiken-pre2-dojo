// rewards.js — コイン・XP・ランク・ストリーク・7日ログインボーナス・カード図鑑
const Rewards = (() => {
  const KEY = "stats_v1";
  const RANKS = [
    { name: "見習い", xp: 0 },
    { name: "三段", xp: 300 },
    { name: "五段", xp: 800 },
    { name: "初段", xp: 1600 },
    { name: "二段", xp: 3000 },
    { name: "四段", xp: 5000 },
    { name: "師範", xp: 8000 },
  ];

  const CARDS = [
    { id: "c1", name: "はじめの一歩", desc: "初めての問題に正解", check: (p) => p.totalCorrect >= 1 },
    { id: "c2", name: "50問突破", desc: "累計50問正解", check: (p) => p.totalCorrect >= 50 },
    { id: "c3", name: "100問突破", desc: "累計100問正解", check: (p) => p.totalCorrect >= 100 },
    { id: "c4", name: "300問突破", desc: "累計300問正解", check: (p) => p.totalCorrect >= 300 },
    { id: "c5", name: "三日坊主卒業", desc: "3日連続で学習", check: (p) => p.maxStreak >= 3 },
    { id: "c6", name: "週間戦士", desc: "7日連続で学習", check: (p) => p.maxStreak >= 7 },
    { id: "c7", name: "鉄人", desc: "14日連続で学習", check: (p) => p.maxStreak >= 14 },
    { id: "c8", name: "セッション制覇", desc: "1日のセッションを完走", check: (p) => p.sessionsDone >= 1 },
    { id: "c9", name: "連覇", desc: "セッションを5回完走", check: (p) => p.sessionsDone >= 5 },
    { id: "c10", name: "無傷", desc: "ミスなしでセッション完走", check: (p) => p.flawless >= 1 },
    { id: "c11", name: "熟語ハンター", desc: "熟語を50個マスター(正解)", check: (p) => p.idiomCorrect >= 50 },
    { id: "c12", name: "単語王", desc: "単語を500個マスター(正解)", check: (p) => p.wordCorrect >= 500 },
  ];

  function defaults() {
    return {
      coins: 0, xp: 0,
      streak: 0, maxStreak: 0, lastStudyDate: null,
      lastLoginClaim: null,        // 7日カレンダーの最終受取日
      calendarStart: null,         // 7日カレンダー開始日
      calendarDay: 0,              // 1..7
      sessionsDone: 0, flawless: 0,
      totalCorrect: 0, totalWrong: 0,
      wordCorrect: 0, idiomCorrect: 0,
      cards: [],
      history: [],                 // {date, correct, wrong, done}
    };
  }

  function load() {
    const d = defaults();
    const p = Store.get(KEY, d);
    // 将来のフィールド追加に対する前方互換マージ
    for (const k of Object.keys(d)) {
      if (!(k in p)) p[k] = d[k];
    }
    return p;
  }
  function save(p) { Store.set(KEY, p); }

  function rankOf(xp) {
    let r = RANKS[0];
    for (const it of RANKS) if (xp >= it.xp) r = it;
    return r;
  }
  function nextRank(xp) {
    for (const it of RANKS) if (xp < it.xp) return it;
    return null;
  }

  function multiplier(streak) {
    if (streak >= 7) return 3;
    if (streak >= 3) return 2;
    return 1;
  }

  // 学習開始時: ストリーク更新 + ログインボーナス判定。戻り値 = 獲得ボーナス情報
  function touchStudy(p, today) {
    const ev = { streakUp: false, bonus: null, cards: [] };
    if (p.lastStudyDate === today) return ev;
    if (p.lastStudyDate === U.addDays(today, -1)) {
      p.streak++;
      ev.streakUp = true;
    } else {
      p.streak = 1;
    }
    p.maxStreak = Math.max(p.maxStreak, p.streak);
    p.lastStudyDate = today;

    // 7日カレンダー
    if (!p.calendarStart || p.lastLoginClaim !== U.addDays(today, -1)) {
      // 連続受取が途切れたらリセット
      if (p.lastLoginClaim && p.lastLoginClaim !== U.addDays(today, -1)) {
        p.calendarStart = today; p.calendarDay = 0;
      }
    }
    if (!p.calendarStart) { p.calendarStart = today; p.calendarDay = 0; }
    if (p.lastLoginClaim !== today) {
      p.calendarDay = (p.calendarDay % 7) + 1;
      p.lastLoginClaim = today;
      const bonusCoins = p.calendarDay === 7 ? 100 : 20;
      p.coins += bonusCoins;
      ev.bonus = { day: p.calendarDay, coins: bonusCoins, rare: p.calendarDay === 7 };
      if (p.calendarDay === 7) ev.cards.push("レアカードパック獲得！");
    }
    save(p);
    return ev;
  }

  function onAnswer(p, isCorrect, kind) {
    if (isCorrect) {
      p.totalCorrect++;
      p.coins += 10 * multiplier(p.streak);
      p.xp += 5;
      if (kind === "idiom") p.idiomCorrect++;
      else p.wordCorrect++;
    } else {
      p.totalWrong++;
    }
  }

  function onSessionDone(p, stats, today) {
    if (!stats.done) return [];
    p.sessionsDone++;
    p.coins += 50;
    p.xp += 30;
    if (stats.wrong === 0) { p.flawless++; p.coins += 50; }
    p.history.push({
      date: today, correct: stats.correct, wrong: stats.wrong,
      done: stats.done,
    });
    if (p.history.length > 60) p.history.shift();
    return checkCards(p);
  }

  function checkCards(p) {
    const newly = [];
    for (const c of CARDS) {
      if (!p.cards.includes(c.id) && c.check(p)) {
        p.cards.push(c.id);
        newly.push(c);
        p.coins += 30;
      }
    }
    if (newly.length) save(p);
    return newly;
  }

  function flush(p) { save(p); }

  return {
    load, save, defaults, rankOf, nextRank, multiplier,
    touchStudy, onAnswer, onSessionDone, checkCards, flush,
    RANKS, CARDS,
  };
})();
