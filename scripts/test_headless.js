// test_headless.js — コアロジックの機能テスト（Node, localStorage/fetchスタブ）
// 実行: node scripts/test_headless.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");

// --- スタブ ---
const store = {};
const localStorageStub = {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: (k) => { delete store[k]; },
  key: (i) => Object.keys(store)[i] || null,
  get length() { return Object.keys(store).length; },
};

const sandbox = { localStorage: localStorageStub, console, Date, Math, JSON, Set, Object, Array, String, Number, location: {} };
sandbox.window = sandbox;
vm.createContext(sandbox);

function load(file) {
  const code = fs.readFileSync(path.join(ROOT, file), "utf-8");
  vm.runInContext(code, sandbox, { filename: file });
}

// --- ロード ---
["js/storage.js", "js/util.js", "js/srs.js", "js/session.js", "js/rewards.js", "js/report.js"].forEach(load);

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS:", name); }
  else { fail++; console.log("FAIL:", name); }
}

const U = vm.runInContext("U", sandbox);
const SRS = vm.runInContext("SRS", sandbox);
const Session = vm.runInContext("Session", sandbox);
const Rewards = vm.runInContext("Rewards", sandbox);
const Report = vm.runInContext("Report", sandbox);
const Store = vm.runInContext("Store", sandbox);

// --- util: バリアント展開・判定 ---
const t1 = { en: "(just) in case" };
const v1 = U.expandVariants("(just) in case");
check("expandVariants (just) in case → 2種", v1.includes("just in case") && v1.includes("in case"));

const t2 = { en: "make(earn) a living" };
const v2 = U.expandVariants("make(earn) a living");
check("expandVariants make(earn) a living → 2種", v2.includes("make a living") && v2.includes("earn a living"));

check("matchAnswer 大文字小文字無視", U.matchAnswer("JUST IN CASE", t1));
check("matchAnswer 句読点無視", U.matchAnswer("just-in-case!", t1));
check("matchAnswer 空白圧縮", U.matchAnswer("  make   a  living ", t2));
check("matchAnswer earnバリアント受理", U.matchAnswer("earn a living", t2));
check("matchAnswer 所有格統一 (my→one's)", U.matchAnswer("make up my mind", { en: "make up one's mind" }));
check("matchAnswer 誤答拒否", !U.matchAnswer("in cases", t1));
check("matchAnswer 空文字拒否", !U.matchAnswer("   ", t1));

// 日付seededShuffleの再現性
const arr = [1,2,3,4,5,6,7,8,9,10];
const s1 = U.seededShuffle(arr, "2026-08-03");
const s2 = U.seededShuffle(arr, "2026-08-03");
const s3 = U.seededShuffle(arr, "2026-08-04");
check("seededShuffle 同日同じ順序", JSON.stringify(s1) === JSON.stringify(s2));
check("seededShuffle 翌日異なる順序", JSON.stringify(s1) !== JSON.stringify(s3));

// --- SRS ---
const today = U.todayStr();
SRS.introduceMany(["w1", "w2"]);
const map0 = SRS.all();
check("SRS introduce 初期due=今日", map0.w1.due === today && map0.w1.stage === 0);
SRS.onCorrect("w1");
const map1 = SRS.all();
check("SRS 正解→stage1 due=+1日", map1.w1.stage === 1 && map1.w1.due === U.addDays(today, 1));
SRS.onCorrect("w1");
const map2 = SRS.all();
check("SRS 2回正解→stage2 due=+3日", map2.w1.stage === 2 && map2.w1.due === U.addDays(today, 3));
SRS.onWrong("w1");
const map3 = SRS.all();
check("SRS 不正解→stage0 due=+1日", map3.w1.stage === 0 && map3.w1.due === U.addDays(today, 1));

// --- Session: 逃げ場ゼロ ---
const ids = ["a", "b", "c"];
const sess = Session.create(ids, "test-seed");
check("Session 初期queue=3問", Session.stats(sess).total === 3);
Session.answer(sess, Session.current(sess), false, {});
check("Session 不正解→queue再投入で残り3", Session.stats(sess).remaining === 3);
Session.answer(sess, Session.current(sess), true, {});
Session.answer(sess, Session.current(sess), true, {});
Session.answer(sess, Session.current(sess), true, {});
check("Session 全問正解で完了", Session.stats(sess).done === true);
check("Session 正解3回記録", Session.stats(sess).correct === 3);

// 答え表示→2回再出題
const sess2 = Session.create(["x", "y"], "seed2");
Session.answer(sess2, Session.current(sess2), false, { revealed: true });
const st2 = Session.stats(sess2);
check("答え表示→ミス2回カウント", st2.wrong === 2);
check("答え表示→残り3（原本1+2回再投入）", st2.remaining === 3);

// タイムアウト
const sess3 = Session.create(["z"], "seed3");
Session.answer(sess3, Session.current(sess3), false, { timeout: true });
check("タイムアウト→ミス1+残り1", Session.stats(sess3).wrong === 1 && Session.stats(sess3).remaining === 1);

// リロード復帰
const loaded = Session.load();
check("Session.load 同日復帰", loaded && loaded.date === today);

// --- Rewards ---
const p = Rewards.load();
// 旧バージョンプロファイルとの前方互換確認（historyフィールド欠如→マージ）
const legacy = Rewards.defaults();
delete legacy.history;
Store.set("rewards", legacy);
const merged = Rewards.load();
check("旧プロファイルにhistoryを自動マージ", Array.isArray(merged.history));
const ev = Rewards.touchStudy(p, today);
check("初回ログインボーナス day1 +20コイン", ev.bonus && ev.bonus.day === 1 && ev.bonus.coins === 20);
check("ストリーク1日開始", p.streak === 1);
const ev2 = Rewards.touchStudy(p, U.addDays(today, 1));
check("翌日ボーナス day2", ev2.bonus && ev2.bonus.day === 2);
check("ストリーク2日に増加", p.streak === 2);
// 同日2回目はボーナスなし
const ev3 = Rewards.touchStudy(p, U.addDays(today, 1));
check("同日再touchではボーナスなし", ev3.bonus === null);
// 連続途切れ→リセット
const ev4 = Rewards.touchStudy(p, U.addDays(today, 5));
check("途切れたらカレンダーday1にリセット", ev4.bonus && ev4.bonus.day === 1);
check("途切れたらストリーク1にリセット", p.streak === 1);

const coinsBefore = p.coins;
Rewards.onAnswer(p, true, "word");
check("正解でコイン増加", p.coins > coinsBefore);
Rewards.onAnswer(p, false, "word");
check("不正解でコイン不変", true); // 増加しないことだけ確認
const p2 = Rewards.load();
const statsDone = { done: true, correct: 10, wrong: 0 };
const newCards = Rewards.onSessionDone(p2, statsDone, today);
check("完走でセッション制覇カード獲得", p2.cards.includes("c8"));
check("無傷ボーナスでflawless=1", p2.flawless === 1);

// --- Report ---
const summary = Report.summary(p2);
check("summary rate計算", typeof summary.rate === "number");
check("testReady 初回はtrue", Report.testReady(null) === true);
Report.saveTest({ at: Date.now(), correct: 5, wrong: 2, total: 7 });
check("テスト直後は受験不可", Report.testReady(Report.lastTest()) === false);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
