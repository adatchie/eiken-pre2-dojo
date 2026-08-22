// H: 毒セッション実証 — queue内idが現データに存在しない(done:false) → 0/0で入力不能になるか
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

function boot(storageState) {
  const logs = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => logs.push("JSDOM: " + e.message + " || " + ((e.detail && e.detail.message) || "").slice(0, 130)));
  const dom = new JSDOM(html, { url: "http://localhost:8931/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole: vc });
  const { window } = dom;
  window.fetch = async (url) => {
    const rel = url.replace(/^https?:\/\/[^/]+\//, "");
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync(fp, "utf-8")) };
  };
  window.confirm = () => true;
  for (const [k, v] of Object.entries(storageState)) window.localStorage.setItem(k, JSON.stringify(v));
  const scripts = ["js/storage.js", "js/util.js", "js/srs.js", "js/session.js", "js/rewards.js", "js/report.js", "js/main.js"];
  window.eval(scripts.map((s) => fs.readFileSync(path.join(ROOT, s), "utf-8")).join("\n;\n"));
  return { window, logs };
}

const today = new Date().toISOString().slice(0, 10);
// 毒: done:false だが queue のidが現words/idiomsに存在しない
const { window: w, logs } = boot({
  dojo2_run_v1: { date: today, seed: today, test: false, queue: ["pre2-9999", "idiom-9999"], pos: 0, correct: 0, wrong: 0, revealed: 0, timeouts: 0, done: false, rewarded: false, finishedAt: null, deadline: 0, deadlinePos: -1, answeredIds: [] },
});
setTimeout(() => {
  // ホームは「進行中」になる → 再開ボタン → セッション画面へ
  const btnResume = w.document.getElementById("btn-resume");
  console.log("btn-resume表示:", btnResume.style.display || "表示");
  btnResume.click();
  setTimeout(() => {
    const sess = w.document.getElementById("screen-session");
    const prog = w.document.getElementById("progress-mini").textContent;
    const q = w.document.getElementById("q-meaning").textContent;
    const inp = w.document.getElementById("answer-input");
    console.log("再開後: session=", sess.style.display || "表示", "| progress=", prog, "| 問題=", JSON.stringify(q), "| input死=", inp.disabled);
    // 入力してみる
    inp.value = "test";
    w.document.getElementById("answer-form").dispatchEvent(new w.Event("submit", { bubbles: true, cancelable: true }));
    const prog2 = w.document.getElementById("progress-mini").textContent;
    console.log("submit後: progress=", prog2, "| logs:", logs.length ? logs[0] : "なし");
    const isBug = prog2 === "0/0" || (sess.style.display !== "none" && !q);
    console.log(isBug ? "★バグ再現: 毒セッションで0/0入力不能" : "再現せず");
    process.exit(0);
  }, 500);
}, 1500);