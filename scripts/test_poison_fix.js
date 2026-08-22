// 毒セッション修正の回帰テスト: H(毒)が自己修復される + 正常系が壊れない
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
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log((cond ? "PASS" : "FAIL") + ":", name); };

// 1) 毒セッション: 再開ボタン → ホームに戻る（新規で始められる）
{
  const { window: w, logs } = boot({
    dojo2_run_v1: { date: today, seed: today, test: false, queue: ["pre2-9999"], pos: 0, correct: 0, wrong: 0, revealed: 0, timeouts: 0, done: false, rewarded: false, finishedAt: null, deadline: 0, deadlinePos: -1, answeredIds: [] },
  });
  setTimeout(() => {
    const btnResume = w.document.getElementById("btn-resume");
    const wasVisible = btnResume.style.display !== "none";
    btnResume.style.display = ""; // 強制表示して押す
    btnResume.click();
    setTimeout(() => {
      const sess = w.document.getElementById("screen-session");
      const home = w.document.getElementById("screen-home");
      check("毒: resume押下で0/0セッションに入らない", sess.style.display === "none");
      check("毒: クラッシュなし", logs.filter(l => l.includes("kind")).length === 0);
      check("毒: ホームへ戻る", home.style.display !== "none");
      // btn-startで新規開始
      const btnStart = w.document.getElementById("btn-start");
      check("毒: 開始ボタンが見える", btnStart.style.display !== "none");
      btnStart.click();
      setTimeout(() => {
        const modal = w.document.getElementById("modal");
        if (modal.style.display === "flex") w.document.getElementById("modal-ok").click();
        setTimeout(() => {
          const prog = w.document.getElementById("progress-mini").textContent;
          const q = w.document.getElementById("q-meaning").textContent;
          check("毒: 新規セッション開始で問題表示", prog.startsWith("0/") && !prog.startsWith("0/0") && q !== "");
          process.exit(fail ? 1 : 0);
        }, 600);
      }, 600);
    }, 500);
  }, 1500);
}