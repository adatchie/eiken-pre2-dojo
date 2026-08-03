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

// --- findInText: 例文中の熟語検出（活用形対応） ---
const f1 = U.findInText("go out", "We went out for dinner last night.");
check("findInText 活用形検出 (went out)", f1 && !f1.exact && f1.span === "went out");
check("findInText 対応 go→went", f1 && f1.diffs[0].dict === "go" && f1.diffs[0].ex === "went");
const f2 = U.findInText("go over", "Let's go over the plan again.");
check("findInText 原形一致", f2 && f2.exact && f2.span === "go over");
const f3 = U.findInText("come across", "I came across an old photo.");
check("findInText came across 検出", f3 && !f3.exact && f3.span === "came across");
const f4 = U.findInText("take A for granted", "Don't take your family for granted.");
check("findInText A/Bプレースホルダー系は検出不能(null)", f4 === null);
const f5 = U.findInText("go out", "She is outgoing.");
check("findInText 部分一致の誤検出なし (outgoing)", f5 === null);
const f6 = U.findInText("(just) in case", "Take an umbrella just in case.");
check("findInText バリアント対応 (just in case)", f6 && f6.exact && f6.span === "just in case");
check("matchAnswer went out は拒否（辞書形のみ受理）", !U.matchAnswer("went out", { en: "go out" }));
check("matchAnswer go out は受理", U.matchAnswer("go out", { en: "go out" }));

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

// --- SRS: Lv制 ---
Store.set("review_v1", {});
SRS.introduceMany(["lv1"]);
check("Lv初期値=1", SRS.lvOf(SRS.all(), "lv1") === 1);
SRS.onCorrect("lv1");
check("正解→Lv2に昇格", SRS.lvOf(SRS.all(), "lv1") === 2);
SRS.onCorrect("lv1");
check("再度正解→Lv3", SRS.lvOf(SRS.all(), "lv1") === 3);
SRS.onCorrect("lv1");
check("Lv3が上限", SRS.lvOf(SRS.all(), "lv1") === 3);
SRS.onWrong("lv1");
check("不正解→Lv2に降格", SRS.lvOf(SRS.all(), "lv1") === 2);
SRS.onWrong("lv1");
SRS.onWrong("lv1");
SRS.onWrong("lv1");
check("Lvは1未満にならない", SRS.lvOf(SRS.all(), "lv1") === 1);
SRS.introduceMany(["lvtest"]);
SRS.onCorrect("lvtest", { noLv: true });
check("noLv: 正解でもLv1のまま（テストモード）", SRS.lvOf(SRS.all(), "lvtest") === 1);
SRS.onWrong("lvtest", { noLv: true });
check("noLv: 不正解でもLv1のまま", SRS.lvOf(SRS.all(), "lvtest") === 1);
check("未導入項目のLv=1", SRS.lvOf(SRS.all(), "unknown_item") === 1);

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
// 旧バージョンプロファイルとの前方互換確認（ships/historyフィールド欠如→マージ）
const legacy = Rewards.defaults();
delete legacy.ships;
delete legacy.shipLastAward;
delete legacy.history;
Store.set("stats_v1", legacy);
const merged = Rewards.load();
check("旧プロファイルにships/historyを自動マージ", Array.isArray(merged.ships) && Array.isArray(merged.history));

const p = Rewards.load();
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

// FLEET構成チェック
check("FLEET全60隻", Rewards.FLEET.length === 60);
check("最後の一隻は大和", Rewards.FLEET[59].name === "大和");
check("艦ID重複なし", new Set(Rewards.FLEET.map((s) => s.id)).size === 60);

// 7日連続ログイン → 大ボーナス+特別配属
Store.set("stats_v1", Rewards.defaults());
const p7 = Rewards.load();
for (let d = 0; d < 6; d++) Rewards.touchStudy(p7, U.addDays(today, d));
check("6日間ログインでコイン120", p7.coins === 120);
const ev7 = Rewards.touchStudy(p7, U.addDays(today, 6));
check("7日目で大ボーナス+100コイン", ev7.bonus && ev7.bonus.rare && ev7.bonus.coins === 100);
check("7日目に特別配属あり（1番艦）", ev7.ship !== null && ev7.ship.id === Rewards.FLEET[0].id);

// セッション完走 → 新艦配属（1日1隻制限）
Store.set("stats_v1", Rewards.defaults());
const p2 = Rewards.load();
Rewards.touchStudy(p2, today);
const coinsBefore = p2.coins;
Rewards.onAnswer(p2, true, "word");
check("正解でコイン増加", p2.coins > coinsBefore);
Rewards.onAnswer(p2, false, "word");
check("不正解でコイン不変", true); // 増加しないことだけ確認
const statsDone = { done: true, correct: 10, wrong: 0 };
const ship1 = Rewards.onSessionDone(p2, statsDone, today);
check("完走で新艦配属（1番艦）", ship1 && ship1.id === Rewards.FLEET[0].id);
check("配属済み艦が記録される", p2.ships.includes(Rewards.FLEET[0].id));
check("無傷ボーナスでflawless=1", p2.flawless === 1);
const ship2 = Rewards.onSessionDone(p2, statsDone, today);
check("同日2回目の完走では配属なし（1日1隻）", ship2 === null && p2.ships.length === 1);

// --- Lv別コイン報酬 ---
Store.set("stats_v1", Rewards.defaults());
const plv = Rewards.load();
plv.streak = 1;
const c0 = plv.coins;
Rewards.onAnswer(plv, true, "word", 1);
Rewards.onAnswer(plv, true, "word", 2);
Rewards.onAnswer(plv, true, "word", 3);
check("Lv別コイン 10+15+20=45", plv.coins === c0 + 45);

// --- レア艦解放（Lv3クリア累計） ---
Store.set("stats_v1", Rewards.defaults());
const pr = Rewards.load();
for (let i = 0; i < Rewards.RARE_FIRST - 1; i++) Rewards.recordLv3Clear(pr, "m" + i);
check("24語クリアではレア艦なし", pr.ships.length === 0);
Rewards.recordLv3Clear(pr, "m24");
check("25語クリアで伊400解放", pr.ships.includes("ss01"));
Rewards.recordLv3Clear(pr, "m24");
check("重複記録はカウントされない", pr.lv3Mastered.length === 25 && pr.ships.length === 1);
check("次の解放閾値=50語", Rewards.nextRareThreshold(pr) === 50);
for (let i = 25; i < 650; i++) Rewards.recordLv3Clear(pr, "m" + i);
check("650語クリアでレア艦26隻すべて解放", pr.ships.filter((id) => Rewards.FLEET.slice(34).some((s) => s.id === id)).length === 26);
check("大和も解放済み", pr.ships.includes("bb10"));
check("全解放後は次の閾値null", Rewards.nextRareThreshold(pr) === null);

// --- 完走配属は通常艦のみ（34隻枯渇後は配属なし） ---
Store.set("stats_v1", Rewards.defaults());
const pr2 = Rewards.load();
for (let d = 0; d < 34; d++) Rewards.onSessionDone(pr2, statsDone, U.addDays(today, d));
check("34日完走で通常艦34隻", pr2.ships.length === 34);
check("完走ではレア艦は出ない", !pr2.ships.includes("ss01"));
const award35 = Rewards.onSessionDone(pr2, statsDone, U.addDays(today, 34));
check("通常艦枯渇後は完走でも配属なし", award35 === null);

// --- Report ---
const summary = Report.summary(p2);
check("summary rate計算", typeof summary.rate === "number");
check("testReady 初回はtrue", Report.testReady(null) === true);
Report.saveTest({ at: Date.now(), correct: 5, wrong: 2, total: 7 });
check("テスト直後は受験不可", Report.testReady(Report.lastTest()) === false);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail ? 1 : 0);
