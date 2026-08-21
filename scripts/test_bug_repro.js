// 0/0バグ検証（修正後）: init()の非同期完了を待ってからUI操作
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => console.log("JSDOM ERROR:", e.message));
vc.on("error", (...a) => console.log("console.error:", ...a));

function boot(storageState, label) {
  console.log("\n=== " + label + " ===");
  const dom = new JSDOM(html, {
    url: "http://localhost:8931/",
    runScripts: "outside-only",
    pretendToBeVisual: true,
    virtualConsole: vc,
  });
  const { window } = dom;
  window.fetch = async (url) => {
    const rel = url.replace(/^https?:\/\/[^/]+\//, "");
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(fp, "utf-8")) };
  };
  window.confirm = () => true;
  window.alert = (m) => console.log("ALERT:", m);
  for (const [k, v] of Object.entries(storageState)) {
    window.localStorage.setItem(k, JSON.stringify(v));
  }
  const scripts = ["js/storage.js", "js/util.js", "js/srs.js", "js/session.js", "js/rewards.js", "js/report.js", "js/main.js"];
  const combined = scripts.map((s) => fs.readFileSync(path.join(ROOT, s), "utf-8")).join("\n;\n");
  window.eval(combined);
  return window;
}

const today = new Date().toISOString().slice(0, 10);

// シナリオ: 当日完走(done:true)残骸 → ホームは「完了」表示 → 開始ボタンは隠れる → 週次テスト以外触れない
// 修正前のバグ経路: done:trueがload()から返り、btn-resume押下でdoneセッションに「再開」→0/0のsession画面
const w = boot({
  dojo2_run_v1: { date: today, seed: today, test: false, queue: ["i001", "i002"], pos: 2, correct: 2, wrong: 0, revealed: 0, timeouts: 0, done: true, rewarded: true, finishedAt: Date.now(), deadline: 0, deadlinePos: -1, answeredIds: ["i001", "i002"] },
}, "当日完走残骸 → btn-resume強制クリック（修正後はload()=nullなので新規 or 完了表示になるはず）");

setTimeout(() => {
  const status = w.document.getElementById("today-status").textContent;
  const btnStart = w.document.getElementById("btn-start");
  const btnResume = w.document.getElementById("btn-resume");
  console.log("home status:", status.slice(0, 50));
  console.log("btn-start表示:", btnStart.style.display || "(表示)", "| btn-resume表示:", btnResume.style.display || "(表示)");

  // 修正検証: doneセッションがload()から返らない → resume経路でも壊れない
  // 見た目を変えてbtn-resumeを無理やり押してみる（修正前はここで0/0セッションに入った）
  btnResume.style.display = "";
  btnResume.click();
  setTimeout(() => {
    const sess = w.document.getElementById("screen-session");
    const prog = w.document.getElementById("progress-mini");
    const q = w.document.getElementById("q-meaning");
    console.log("resume後: session画面=", sess.style.display, "| progress=", JSON.stringify(prog.textContent), "| 問題=", JSON.stringify(q ? q.textContent : null));
    const ok = !(sess.style.display !== "none" && prog.textContent.startsWith("0/0") && !q.textContent);
    console.log(ok ? "PASS: 0/0セッションに入らない" : "FAIL: まだ0/0に入る");
    process.exit(ok ? 0 : 1);
  }, 500);
}, 1500);