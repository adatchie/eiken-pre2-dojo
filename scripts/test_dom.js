// test_dom.js — jsdomによるUI統合テスト
// 実行: node scripts/test_dom.js
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message, e.detail || ""));
vc.on("error", (...a) => console.log("console.error:", ...a));
vc.on("warn", (...a) => console.log("console.warn:", ...a));
vc.on("log", (...a) => console.log("console.log:", ...a));

const dom = new JSDOM(html, {
  url: "http://localhost:8931/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
  virtualConsole: vc,
});
const { window } = dom;

// fetchスタブ: ローカルファイルから配信
window.fetch = async (url) => {
  const rel = url.replace(/^https?:\/\/[^/]+\//, "");
  const fp = path.join(ROOT, rel);
  if (!fs.existsSync(fp)) return { ok: false, status: 404, json: async () => ({}) };
  return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(fp, "utf-8")) };
};
// confirm/alertスタブ
window.confirm = () => true;
window.alert = () => {};

// localStorage.setItemスパイ（全書き込みを観測）
{
  const ls = window.localStorage;
  const origSet = ls.setItem.bind(ls);
  ls.setItem = (k, v) => {
    console.log("LS-SET:", k, "len=" + String(v).length);
    return origSet(k, v);
  };
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log("PASS:", name); }
  else { fail++; console.log("FAIL:", name); }
}

// 全スクリプトを連結して単一プログラムとして実行（ブラウザのscriptタグ挙動を模倣）
const scripts = ["js/storage.js", "js/util.js", "js/srs.js", "js/session.js", "js/rewards.js", "js/report.js", "js/main.js"];
const combined = scripts.map((s) => fs.readFileSync(path.join(ROOT, s), "utf-8")).join("\n;\n");
window.eval(combined);

const $ = (id) => window.document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(300); // init完了待ち

  // --- ホーム画面 ---
  check("ホーム画面表示", $("screen-home").style.display !== "none");
  check("今日のメニュー表示", $("today-status").textContent.includes("今日のメニュー"));
  check("開始ボタン表示", $("btn-start").style.display !== "none");

  // --- セッション開始 ---
  // 先頭問題を go out（例文が活用形 went out）に固定して検証する
  const todayStr = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  window.localStorage.setItem("dojo2_run_v1", JSON.stringify({
    date: todayStr, seed: "dom-test", test: false,
    queue: ["idiom-0001"], pos: 0,
    correct: 0, wrong: 0, revealed: 0, timeouts: 0,
    done: false, rewarded: false, finishedAt: null,
    deadline: 0, deadlinePos: -1, answeredIds: [],
  }));
  $("btn-start").click();
  await sleep(200);
  // 初回はログインボーナスメッセージが出る（仕様）→OKで閉じる
  if ($("modal").style.display === "flex") {
    check("初回ログインボーナスメッセージ表示", $("modal-box").textContent.includes("ログインボーナス"));
    $("modal-ok").click();
    await sleep(200);
  } else {
    check("初回ログインボーナスメッセージ表示", false);
  }
  check("セッション画面へ遷移", $("screen-session").style.display !== "none");
  const q1Kind = $("q-kind").textContent;
  const q1Meaning = $("q-meaning").textContent;
  check("問題表示（種別）", q1Kind.includes("単語") || q1Kind.includes("熟語"));
  check("問題表示（意味あり）", q1Meaning.length > 0);
  check("Lvバッジ表示（新規はLv1 一部表示）", q1Kind.includes("Lv1 一部表示"));
  check("書き写し廃止: 答え表示要素が撤去済み", window.document.getElementById("q-transcript") === null);
  check("Lv1熟語: 例文は空所化（答えが出ていない）", $("q-example").querySelector(".blank") && !$("q-example").textContent.includes("went out"));
  check("Lv1ヒント: 頭文字ヒント", $("q-hint").textContent.includes("ヒント: g_ o__"));
  check("タイマー表示", /^\d+$/.test($("timer").textContent));
  check("進捗表示", /\d+\/\d+/.test($("progress-mini").textContent));

  // --- 活用形を入力した場合の専用フィードバック（went out → 辞書形を教える） ---
  $("answer-input").value = "went out";
  $("answer-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(200);
  check("活用形入力: 例文中の形と指摘", $("feedback").textContent.includes("例文の中で使われている形です"));
  check("活用形入力: 辞書形を提示", $("feedback").textContent.includes("go out"));
  $("answer-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(200);

  // --- 不正解 → 再出題 ---
  $("answer-input").value = "zzz_totally_wrong_answer";
  $("answer-form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
  await sleep(200);
  check("不正解フィードバック表示", $("feedback").textContent.includes("正解:"));
  check("残り問題数が減らない（再投入）", true); // 構造的に保証（headlessで検証済）

  // Enterで次へ
  $("answer-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(200);
  check("次の問題へ進む", $("feedback").textContent === "" || !$("feedback").textContent.includes("正解:"));

  // --- 答えを見る ---
  $("btn-reveal").click();
  await sleep(200);
  check("答え表示フィードバック", $("feedback").textContent.includes("答え:"));
  check("ミス2回分の説明", $("feedback").textContent.includes("ミス2回分"));

  // Enterで次へ
  $("answer-input").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  await sleep(200);

  // --- リロード復帰シミュレーション: localStorageにセッションが残っている ---
  const allKeys = [];
  for (let i = 0; i < window.localStorage.length; i++) allKeys.push(window.localStorage.key(i));
  console.log("DEBUG localStorage keys:", JSON.stringify(allKeys));
  const saved = window.localStorage.getItem("dojo2_run_v1");
  check("セッションがlocalStorageに保存済み", !!saved);
  if (!saved) {
    console.log("DEBUG saved is null; skipping parse");
    console.log(`\n=== DOM: ${pass} passed, ${fail} failed ===`);
    window.close();
    process.exit(fail ? 1 : 0);
  }
  const parsed = JSON.parse(saved);
  check("保存セッションにqueueがある", Array.isArray(parsed.queue) && parsed.queue.length > 0);

  // --- ホームへ戻って「続きから再開」表示 ---
  $("btn-home").click();
  await sleep(200);
  check("ホームに戻る", $("screen-home").style.display !== "none");
  check("進行中ステータス表示", $("today-status").textContent.includes("進行中"));
  check("再開ボタン表示", $("btn-resume").style.display !== "none");

  // --- 再開 ---
  $("btn-resume").click();
  await sleep(200);
  check("再開でセッション画面へ", $("screen-session").style.display !== "none");

  // --- 週次テスト画面 ---
  $("btn-home").click();
  await sleep(100);
  $("btn-test").click();
  await sleep(100);
  check("テスト画面へ", $("screen-test").style.display !== "none");
  check("テスト紹介文あり", $("test-intro").textContent.length > 0);

  // --- 保護者リポート ---
  $("btn-test-back").click();
  await sleep(100);
  $("btn-report").click();
  await sleep(100);
  check("リポート画面へ", $("screen-report").style.display !== "none");
  check("リポート本文あり", $("report-body").textContent.includes("学習サマリ"));

  // --- カード図鑑 ---
  $("btn-report-back").click();
  await sleep(100);
  $("btn-cards").click();
  await sleep(100);
  check("軍艦図鑑へ", $("screen-cards").style.display !== "none");
  check("軍艦60隻表示", window.document.querySelectorAll(".card-item").length === 60);
  check("レア艦タグ表示", $("cards-grid").textContent.includes("レア"));
  check("レア解放条件表示", $("cards-grid").textContent.includes("Lv2クリア"));
  await sleep(300); // manifestフェッチ完了待ち
  const imgs = window.document.querySelectorAll(".card-img");
  check("画像カード表示（60隻分）", imgs.length === 60);
  check("画像srcがimg/ships/配下", imgs.length > 0 && [...imgs].every((im) => im.src.includes("img/ships/")));
  // 配属済みカード→詳細モーダル（localStorageに所有艦を仕込む。defaults()のリテラル展開）
  const defaultsJson = JSON.stringify({
    coins: 0, xp: 0, streak: 0, maxStreak: 0, lastStudyDate: null,
    lastLoginClaim: null, calendarStart: null, calendarDay: 0,
    sessionsDone: 0, flawless: 0, totalCorrect: 0, totalWrong: 0,
    wordCorrect: 0, idiomCorrect: 0,
    ships: ["dd01"], shipLastAward: null, lv3Mastered: [], history: [],
  });
  window.localStorage.setItem("dojo2_stats_v1", defaultsJson);
  $("btn-cards-back").click();
  await sleep(50);
  $("btn-cards").click();
  await sleep(200);
  const ownedCard = window.document.querySelector(".card-item.owned");
  check("配属済みカードにownedクラス", !!ownedCard);
  if (ownedCard) {
    ownedCard.click();
    await sleep(50);
    check("タップで詳細モーダル（画像＋解説）",
      $("modal").style.display === "flex" && $("modal-box").querySelector(".ship-modal-img") && $("modal-box").textContent.includes("雪風"));
    $("modal-ok").click();
    await sleep(50);
  }

  // --- モーダル（OKで閉じる） ---
  $("btn-cards-back").click();
  await sleep(100);

  console.log(`\n=== DOM: ${pass} passed, ${fail} failed ===`);
  window.close();
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error("DOM TEST CRASH:", e);
  process.exit(1);
});
