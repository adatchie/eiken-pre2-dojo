// I: 期限切れdeadline再開バグの再現+修正検証
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom");

const ROOT = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf-8");

function boot(storageState) {
  const logs = [];
  const vc = new VirtualConsole();
  vc.on("jsdomError", (e) => logs.push(e.message + " || " + ((e.detail && e.detail.message) || "").slice(0, 120)));
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
// 期限切れdeadline残骸: 問題途中で閉じて、時間が過ぎてから再開
const { window: w, logs } = boot({
  dojo2_run_v1: { date: today, seed: today, test: false, queue: ["idiom-0001", "idiom-0002"], pos: 0, correct: 0, wrong: 0, revealed: 0, timeouts: 0, done: false, rewarded: false, finishedAt: null, deadline: Date.now() - 60000, deadlinePos: 0, answeredIds: [] },
});
setTimeout(() => {
  const btnResume = w.document.getElementById("btn-resume");
  console.log("btn-resume表示:", btnResume.style.display || "表示");
  btnResume.click();
  setTimeout(() => {
    const sess = w.document.getElementById("screen-session");
    const prog = w.document.getElementById("progress-mini").textContent;
    const q = w.document.getElementById("q-meaning").textContent;
    const inp = w.document.getElementById("answer-input");
    console.log("再開後: session=", sess.style.display || "表示", "| progress=", prog, "| 問題=", JSON.stringify(q.slice(0, 20)), "| input死=", inp.disabled);
    const ok = sess.style.display !== "none" && q !== "" && !prog.startsWith("0/0");
    console.log(ok ? "PASS: 期限切れdeadlineでも問題が表示される" : "FAIL: まだ0/0");
    console.log("logs:", logs.length ? logs.slice(0, 2) : "なし");
    process.exit(ok ? 0 : 1);
  }, 800);
}, 1500);