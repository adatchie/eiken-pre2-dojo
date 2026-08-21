// main.js — 英検準2級 タイピング道場 メインロジック
(() => {
  "use strict";

  const NEW_PER_DAY = 20;
  const MAX_PER_DAY = 60;
  const TIME_LIMIT = 20; // 秒
  const LV_NAMES = { 1: "Lv1 一部表示", 2: "Lv2 本番" };

  let WORDS = [];   // {id,en,ja,kind:"word"}
  let IDIOMS = [];  // {id,en,ja,ex,cat,tier,kind:"idiom"}
  let ALL = [];
  let BY_ID = {};

  let sess = null;       // 現在のセッション
  let mode = "daily";    // "daily" | "test"
  let combo = 0;
  let phase = "idle";    // "answering" | "feedback" | "done"
  let timerHandle = null;
  let profile = null;

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const screens = ["home", "session", "done", "test", "report", "cards"];
  function show(name) {
    screens.forEach((s) => { $("screen-" + s).style.display = s === name ? "" : "none"; });
  }

  // ---------- データ読込 ----------
  async function loadData() {
    const [wRes, iRes] = await Promise.all([
      fetch("data/words_pre2.json"),
      fetch("data/idioms_pre2.json"),
    ]);
    if (!wRes.ok || !iRes.ok) throw new Error("データ読み込み失敗");
    const wData = await wRes.json();
    const iData = await iRes.json();
    WORDS = wData.map((w) => ({ id: w.id, en: w.en, ja: w.ja, kind: "word" }));
    IDIOMS = iData.items.map((it) => ({
      id: it.id, en: it.en, ja: it.ja, ex: it.ex || "", cat: it.cat, tier: it.tier, kind: "idiom",
    }));
    ALL = WORDS.concat(IDIOMS);
    BY_ID = {};
    ALL.forEach((it) => { BY_ID[it.id] = it; });
  }

  // ---------- セッション構築 ----------
  function newItemsPriority() {
    const map = SRS.all();
    const un = (arr) => arr.filter((it) => !map[it.id]);
    const tierOrder = { A: 0, B: 1, C: 2 };
    const idiomNew = un(IDIOMS).sort((a, b) => (tierOrder[a.tier] ?? 3) - (tierOrder[b.tier] ?? 3));
    const wordNew = un(WORDS);
    return idiomNew.concat(wordNew);
  }

  function buildDailyQueue() {
    const map = SRS.all();
    const today = U.todayStr();
    const fresh = newItemsPriority().slice(0, NEW_PER_DAY).map((it) => it.id);
    SRS.introduceMany(fresh);
    const freshSet = new Set(fresh);
    // 復習: 期限到達分（弱点優先: badの多い順）
    const due = [];
    for (const it of ALL) {
      if (freshSet.has(it.id)) continue;
      const st = map[it.id];
      if (st && SRS.isDue(map, it.id, today)) due.push({ id: it.id, bad: st.bad || 0 });
    }
    due.sort((a, b) => b.bad - a.bad);
    const dueIds = due.slice(0, MAX_PER_DAY - fresh.length).map((d) => d.id);
    return fresh.concat(dueIds);
  }

  function startDaily() {
    mode = "daily";
    let s = Session.load();
    if (!s) {
      const ids = buildDailyQueue();
      if (!ids.length) { showModal("今日は復習待ちの問題がありません。<br>明日また来よう！"); return; }
      s = Session.create(ids, U.todayStr());
    }
    sess = s;
    profile = Rewards.load();
    const ev = Rewards.touchStudy(profile, U.todayStr());
    Rewards.flush(profile);
    if (ev.bonus) {
      const shipLine = ev.ship ? `<br>⚓ 特別配属！ <b>${ev.ship.type}「${ev.ship.name}」</b>` : "";
      showModal(`🎁 ログインボーナス ${ev.bonus.day}日目<br>+${ev.bonus.coins}コイン${ev.bonus.rare ? "<br>🌟 大ボーナス！" : ""}${shipLine}`, () => enterSession());
    } else {
      enterSession();
    }
  }

  function enterSession() {
    // セッション無効（当日完走後の残骸など）はホームへ戻す（0/0バグ対策）
    if (!sess || Session.isDone(sess)) { renderHome(); return; }
    show("session");
    combo = 0;
    updateTopbar();
    // リロード復帰: 制限時間超過チェック
    if (sess.deadline && Date.now() > sess.deadline) {
      handleTimeout();
    } else {
      renderQuestion();
    }
  }

  // ---------- 出題 ----------
  function currentLv(id) {
    return mode === "test" ? 2 : SRS.lvOf(SRS.all(), id);
  }

  function renderQuestion() {
    const id = Session.current(sess);
    if (!id) { finishSession(); return; }
    phase = "answering";
    const it = BY_ID[id];
    const lv = currentLv(id);
    $("q-kind").innerHTML = escapeHtml(it.kind === "idiom" ? `熟語 ${it.tier ? "【でる度" + it.tier + "】" : ""}` : "単語") +
      ` <span class="lv-badge lv${lv}">${LV_NAMES[lv]}</span>`;
    $("q-meaning").textContent = it.ja;
    // 例文: 熟語部分を空所化（活用形でも正しく空所にする）
    const exEl = $("q-example");
    if (it.kind === "idiom" && it.ex) {
      exEl.innerHTML = blankExample(it);
    } else {
      exEl.textContent = "";
    }
    $("q-hint").textContent = hintFor(it, lv);
    $("feedback").textContent = "";
    $("feedback").className = "feedback";
    const inp = $("answer-input");
    inp.value = "";
    inp.disabled = false;
    $("btn-reveal").style.display = "";
    updateProgress();
    startTimer();
    setTimeout(() => inp.focus(), 50);
  }

  // 例文中の熟語相当部分（活用形を含む）をトークン位置つきで特定する
  function exampleTokens(it) {
    const toks = it.ex.trim().split(/\s+/);
    const hit = U.findInText(it.en, it.ex);
    return { toks, hit };
  }

  // 熟語部分を空欄化（活用形 went out なども正しく空所にする）
  function blankExample(it) {
    const { toks, hit } = exampleTokens(it);
    if (!hit) return escapeHtml(it.ex);
    const parts = [];
    if (hit.start > 0) parts.push(escapeHtml(toks.slice(0, hit.start).join(" ")));
    parts.push('<span class="blank">＿＿＿</span>');
    if (hit.start + hit.len < toks.length) parts.push(escapeHtml(toks.slice(hit.start + hit.len).join(" ")));
    return parts.join(" ");
  }

  function hintFor(it, lv) {
    const n = U.displayForm(U.expandVariants(it.en)[0]);
    const words = n.split(" ");
    if (lv === 1) {
      // 一部表示: 各単語の頭文字だけ表示（意味→綴りの想起を必ず起こす）
      const masked = words.map((w) => w[0] + "_".repeat(Math.max(0, w.length - 1))).join(" ");
      return `ヒント: ${masked}`;
    }
    // Lv2本番: 単語数＋文字数のみ
    return `ヒント: ${words.length}語 ／ ${words.map((w) => w.length).join("+")}文字`;
  }

  function updateProgress() {
    const st = Session.stats(sess);
    $("progress-mini").textContent = `${st.answered}/${st.total}（残り${st.remaining}）`;
  }

  // ---------- タイマー ----------
  function startTimer() {
    stopTimer();
    const now = Date.now();
    if (!sess.deadline || sess.deadlinePos !== sess.pos) {
      sess.deadline = now + TIME_LIMIT * 1000;
      sess.deadlinePos = sess.pos;
      Session.save(sess);
    }
    tickTimer();
    timerHandle = setInterval(tickTimer, 200);
  }

  function tickTimer() {
    if (phase !== "answering") return;
    const remain = Math.max(0, sess.deadline - Date.now());
    const sec = Math.ceil(remain / 1000);
    $("timer").textContent = sec;
    $("timer").classList.toggle("warn", sec <= 5);
    $("timerbar").style.width = (remain / (TIME_LIMIT * 1000)) * 100 + "%";
    if (remain <= 0) handleTimeout();
  }

  function stopTimer() {
    if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
  }

  function handleTimeout() {
    if (phase !== "answering") return;
    const id = Session.current(sess);
    const lv = currentLv(id);
    stopTimer();
    combo = 0;
    sess = Session.answer(sess, id, false, { timeout: true });
    Rewards.onAnswer(profile, false, BY_ID[id].kind, lv);
    Rewards.flush(profile);
    const it = BY_ID[id];
    const fb = $("feedback");
    fb.innerHTML = `⏰ 時間切れ！ 正解: <b>${escapeHtml(it.en)}</b>`;
    fb.className = "feedback ng";
    showFeedbackPhase();
  }

  // ---------- 解答 ----------
  function submitAnswer() {
    if (phase === "feedback") { nextQuestion(); return; }
    if (phase !== "answering") return;
    const inp = $("answer-input");
    const val = inp.value;
    if (!val.trim()) return;
    const id = Session.current(sess);
    const it = BY_ID[id];
    const lv = currentLv(id);
    const ok = U.matchAnswer(val, it);
    stopTimer();
    sess = Session.answer(sess, id, ok, {});
    Rewards.onAnswer(profile, ok, it.kind, lv);
    let unlocked = [];
    if (ok && lv === 2 && mode === "daily") {
      unlocked = Rewards.recordLv3Clear(profile, id);
    }
    const fb = $("feedback");
    if (ok) {
      combo++;
      let msg = `⭕ 正解！ ${combo >= 3 ? "🔥" + combo + "コンボ！" : ""}`;
      if (mode === "daily" && lv < 2) msg += `<br><span style="font-size:.85rem">⬆️ ${LV_NAMES[lv + 1]} に昇格！</span>`;
      if (mode === "daily" && lv === 2) msg += `<br><span style="font-size:.85rem;color:#64748b">Lv2クリア！（累計${profile.lv3Mastered.length}語）</span>`;
      if (unlocked.length) {
        msg += unlocked.map((s) => `<br><b>🔓 レア艦解放！ ${s.type}「${s.name}」</b>`).join("");
      }
      fb.innerHTML = msg;
      fb.className = "feedback ok";
    } else {
      combo = 0;
      // 例文の活用形をそのまま入力した場合（went out など）は専用フィードバックで教える
      const hit = it.kind === "idiom" && it.ex ? U.findInText(it.en, it.ex) : null;
      const typedInflected = hit && !hit.exact && U.normalize(val) === U.normalize(hit.span);
      if (typedInflected) {
        fb.innerHTML = `❌ 「${escapeHtml(hit.span)}」は例文の中で使われている形です。<br>ここでは辞書形 <b>${escapeHtml(it.en)}</b> を入力しよう！<br><span style="font-size:.85rem;color:#64748b">この問題は正解するまで出続けます</span>`;
      } else {
        fb.innerHTML = `❌ 正解: <b>${escapeHtml(it.en)}</b><br><span style="font-size:.85rem;color:#64748b">この問題は正解するまで出続けます</span>`;
      }
      fb.className = "feedback ng";
    }
    Rewards.flush(profile);
    showFeedbackPhase(ok);
  }

  function revealAnswer() {
    if (phase !== "answering") return;
    const id = Session.current(sess);
    stopTimer();
    combo = 0;
    sess = Session.answer(sess, id, false, { revealed: true });
    Rewards.onAnswer(profile, false, BY_ID[id].kind);
    Rewards.flush(profile);
    const it = BY_ID[id];
    const fb = $("feedback");
    fb.innerHTML = `👀 答え: <b>${escapeHtml(it.en)}</b><br><span style="font-size:.85rem;color:#64748b">ミス2回分として記録。もう1回追加で出題されます</span>`;
    fb.className = "feedback show-answer";
    showFeedbackPhase();
  }

  function showFeedbackPhase(autoNext = false) {
    phase = "feedback";
    $("answer-input").disabled = true;
    $("btn-reveal").style.display = "none";
    updateProgress();
    updateTopbar();
    if (Session.isDone(sess)) {
      setTimeout(finishSession, autoNext ? 900 : 1200);
      return;
    }
    if (autoNext) {
      setTimeout(nextQuestion, 900);
    } else {
      // タップ/Enterで次へ
      $("answer-input").placeholder = "タップで次の問題へ";
    }
  }

  function nextQuestion() {
    if (phase !== "feedback") return;
    $("answer-input").placeholder = "英語で入力…";
    renderQuestion();
  }

  // ---------- 完了 ----------
  function finishSession() {
    stopTimer();
    phase = "done";
    const st = Session.stats(sess);
    const isTest = mode === "test";
    let newShip = null;
    if (!isTest && st.done && !sess.rewarded) {
      sess.rewarded = true;
      Session.save(sess);
      newShip = Rewards.onSessionDone(profile, st, U.todayStr());
      Rewards.flush(profile);
    }
    if (isTest) {
      Report.saveTest({ at: Date.now(), correct: st.correct, wrong: st.wrong, total: st.total });
    }
    $("done-stats").innerHTML =
      `正解 <b>${st.correct}</b> ／ ミス <b>${st.wrong}</b>` +
      (st.timeouts ? `（うち時間切れ ${st.timeouts}）` : "") +
      (st.revealed ? `（うち答え表示 ${st.revealed}）` : "") +
      (isTest ? "<br>📝 テスト結果を保存しました" : "");
    const rw = [];
    if (!isTest && st.done) {
      rw.push(`🪙 セッション完了ボーナス +50コイン`);
      if (st.wrong === 0) rw.push(`✨ 無傷クリアボーナス +50コイン`);
      if (newShip) {
        rw.push(`⚓ <b>新艦配属！</b> ${newShip.type}「${newShip.name}」<br><span style="font-size:.85rem;color:#64748b">${newShip.note}（配属 ${profile.ships.length}/${Rewards.FLEET.length}隻）</span>`);
        if (profile.ships.length === Rewards.FLEET.length) {
          rw.push(`🎌 <b>連合艦隊 全艦コンプリート！</b>`);
        }
      }
    }
    $("done-rewards").innerHTML = rw.length ? rw.join("<br>") : "";
    $("btn-done-home").textContent = isTest ? "ホームへ戻る" : "ホームへ戻る";
    show("done");
    updateTopbar();
  }

  // ---------- 週次テスト ----------
  function openTest() {
    const last = Report.lastTest();
    const ready = Report.testReady(last);
    const intro = $("test-intro");
    if (!ready) {
      const days = Math.ceil((7 * 24 * 3600 * 1000 - (Date.now() - last.at)) / (24 * 3600 * 1000));
      intro.innerHTML = `前回のテストからまだ7日経っていません。<br>次回受験可能まで <b>あと${days}日</b>`;
      $("btn-test-start").style.display = "none";
    } else {
      const ids = Report.buildTestItems(ALL);
      if (!ids.length) {
        intro.innerHTML = "まだ弱点データがありません。<br>まず日々の修行で問題を解こう！";
        $("btn-test-start").style.display = "none";
      } else {
        intro.innerHTML = `苦手な問題から <b>${ids.length}問</b> 出題します。<br>全問 <b>Lv2 本番形式</b>（単語数＋文字数のみ）・制限時間あり・再出題なしです。`;
        $("btn-test-start").style.display = "";
      }
    }
    show("test");
  }

  function startTest() {
    mode = "test";
    const ids = Report.buildTestItems(ALL);
    sess = Session.create(ids, U.todayStr() + "_test", { test: true });
    profile = Rewards.load();
    enterSession();
  }

  // ---------- 保護者リポート ----------
  function openReport() {
    profile = Rewards.load();
    const sum = Report.summary(profile);
    const map = SRS.all();
    let introduced = 0, mastered = 0;
    Object.values(map).forEach((st) => {
      introduced++;
      if (st.stage >= 4) mastered++;
    });
    const rank = Rewards.rankOf(profile.xp);
    let html = `
      <b>【学習サマリ（直近7回分）】</b><br>
      学習日数: ${sum.days}日 ／ 正答率: <b>${sum.rate}%</b><br>
      正解 ${sum.correct}問 ／ ミス ${sum.wrong}問 ／ 連続学習 ${sum.streak}日<br><br>
      <b>【進度】</b><br>
      導入済み: ${introduced}語 ／ 定着(4回以上連続正解): ${mastered}語<br>
      Lv2クリア（本番難易度で正解）: <b>${profile.lv3Mastered.length}語</b><br>
      ランク: ${rank.name} ／ XP: ${profile.xp} ／ コイン: ${profile.coins}<br>
      配属済み軍艦: ${profile.ships.length}隻 ／ ${Rewards.FLEET.length}隻（レア解放まで: ${Rewards.nextRareThreshold(profile) ? Rewards.nextRareThreshold(profile) - profile.lv3Mastered.length + "語" : "全解放"}）`;
    if (profile.history.length) {
      html += `<br><br><b>【履歴（最新10件）】</b><table class="report-table"><tr><th>日付</th><th>正解</th><th>ミス</th><th>完走</th></tr>`;
      profile.history.slice(-10).reverse().forEach((h) => {
        html += `<tr><td>${h.date}</td><td>${h.correct}</td><td>${h.wrong}</td><td>${h.done ? "✔" : "—"}</td></tr>`;
      });
      html += `</table>`;
    }
    $("report-body").innerHTML = html;
    show("report");
  }

  // ---------- 軍艦図鑑 ----------
  let SHIP_MANIFEST = {};  // {shipId: {title, img}} — img/ships/manifest.json
  async function loadShipManifest() {
    try {
      const res = await fetch("img/ships/manifest.json");
      if (res.ok) SHIP_MANIFEST = await res.json();
    } catch (e) { /* 画像なしでも動作は継続 */ }
  }
  function shipImg(id) {
    const m = SHIP_MANIFEST[id];
    return m && m.img ? `img/ships/${m.img}` : null;
  }
  function openShipModal(id) {
    const ship = Rewards.FLEET.find((s) => s.id === id);
    if (!ship) return;
    const idx = Rewards.FLEET.indexOf(ship);
    const isRare = idx >= Rewards.REGULAR_COUNT;
    const img = shipImg(id);
    showModal(
      `<div class="ship-modal-img">${img ? `<img src="${img}" alt="${escapeHtml(ship.name)}">` : "⚓"}</div>
      <div class="ship-modal-name">${escapeHtml(ship.name)}${isRare ? " <span class='rare-tag'>レア</span>" : ""}</div>
      <div class="ship-modal-type">${escapeHtml(ship.type)}</div>
      <div class="ship-modal-desc">${escapeHtml(ship.note)}</div>` +
      (SHIP_MANIFEST[id] ? `<div class="ship-modal-src">画像: ${escapeHtml(SHIP_MANIFEST[id].src || "Wikipedia")}</div>` : "")
    );
  }
  function openCards() {
    profile = Rewards.load();
    const owned = new Set(profile.ships);
    const grid = $("cards-grid");
    const mastered = profile.lv3Mastered.length;
    const nextThr = Rewards.nextRareThreshold(profile);
    let html = `<div class="fleet-summary">配属進捗 <b>${profile.ships.length}</b> ／ ${Rewards.FLEET.length}隻<br>
      <span style="font-size:.85rem">Lv2クリア累計: <b>${mastered}語</b>${nextThr ? `（次のレア艦は${nextThr}語で解放）` : "（レア艦すべて解放済み）"}</span></div>`;
    const byType = {};
    Rewards.FLEET.forEach((ship, idx) => {
      (byType[ship.type] = byType[ship.type] || []).push({ ship, idx });
    });
    for (const type of ["駆逐艦", "軽巡洋艦", "重巡洋艦", "潜水艦", "空母", "戦艦"]) {
      const list = byType[type];
      if (!list) continue;
      const ownedInType = list.filter((x) => owned.has(x.ship.id)).length;
      const isRare = list[0].idx >= Rewards.REGULAR_COUNT;
      html += `<div class="fleet-type">${isRare ? "⭐ " : ""}${type}（${ownedInType}/${list.length}）${isRare ? "<span class='rare-tag'>レア</span>" : ""}</div>`;
      html += list.map(({ ship, idx }) => {
        const has = owned.has(ship.id);
        const desc = has ? ship.note
          : (idx >= Rewards.REGULAR_COUNT
            ? `Lv2クリア${Rewards.RARE_FIRST + (idx - Rewards.REGULAR_COUNT) * Rewards.RARE_STEP}語で解放`
            : "セッション完走で配属");
        const img = shipImg(ship.id);
        const imgHtml = img
          ? `<img class="card-img" src="${img}" alt="" loading="lazy">`
          : `<div class="icon">${has ? "⚓" : "🌊"}</div>`;
        return `<div class="card-item ${has ? "" : "locked"} ${idx >= Rewards.REGULAR_COUNT ? "rare" : ""}${has ? " owned" : ""}" data-ship="${ship.id}">
          ${imgHtml}
          <div class="name">${has ? ship.name : "？？？"}</div>
          <div class="desc">${desc}</div>
        </div>`;
      }).join("");
    }
    if (profile.ships.length === Rewards.FLEET.length) {
      html += `<div class="fleet-complete">🎌 連合艦隊 全艦コンプリート！</div>`;
    }
    grid.innerHTML = html;
    // 配属済みカードはタップで詳細モーダル
    grid.querySelectorAll(".card-item.owned").forEach((el) => {
      el.onclick = () => openShipModal(el.dataset.ship);
    });
    show("cards");
  }

  // ---------- ホーム ----------
  function updateTopbar() {
    profile = profile || Rewards.load();
    $("coin-count").textContent = profile.coins;
    $("streak-count").textContent = profile.streak;
    const rank = Rewards.rankOf(profile.xp);
    $("rank-badge").textContent = rank.name;
    const next = Rewards.nextRank(profile.xp);
    if (next) {
      const prevXp = rank.xp;
      const pct = Math.min(100, ((profile.xp - prevXp) / (next.xp - prevXp)) * 100);
      $("xpbar").style.width = pct + "%";
      $("xp-label").textContent = `${rank.name} → ${next.name} まで XP ${next.xp - profile.xp}`;
    } else {
      $("xpbar").style.width = "100%";
      $("xp-label").textContent = "最高ランク到達！";
    }
  }

  function renderHome() {
    profile = Rewards.load();
    updateTopbar();
    const s = Session.load();
    const status = $("today-status");
    const btnStart = $("btn-start");
    const btnResume = $("btn-resume");
    if (s && !s.done) {
      const st = Session.stats(s);
      status.innerHTML = `📖 <b>今日の修行 進行中</b><br>進捗: ${st.answered}/${st.total}（残り${st.remaining}問）<br>正解 ${st.correct} ／ ミス ${st.wrong}`;
      btnStart.style.display = "none";
      btnResume.style.display = "";
    } else if (s && s.done) {
      const st = Session.stats(s);
      status.innerHTML = `✅ <b>今日の修行 完了！</b><br>正解 ${st.correct} ／ ミス ${st.wrong}<br>明日も頑張ろう！`;
      btnStart.style.display = "none";
      btnResume.style.display = "none";
    } else {
      const map = SRS.all();
      const today = U.todayStr();
      let dueCount = 0;
      for (const it of ALL) {
        const st = map[it.id];
        if (st && SRS.isDue(map, it.id, today)) dueCount++;
      }
      const freshCount = Math.min(NEW_PER_DAY, newItemsPriority().length);
      status.innerHTML = `📅 今日のメニュー<br>新出: <b>${freshCount}語</b> ＋ 復習: <b>${dueCount}問</b>（上限${MAX_PER_DAY}問）`;
      btnStart.style.display = "";
      btnResume.style.display = "none";
    }
    show("home");
  }

  // ---------- モーダル ----------
  function showModal(html, onClose) {
    $("modal-box").innerHTML = html + `<button class="btn btn-primary" id="modal-ok">OK</button>`;
    $("modal").style.display = "flex";
    $("modal-ok").onclick = () => {
      $("modal").style.display = "none";
      if (onClose) onClose();
    };
  }

  // ---------- ヘルパー ----------
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  // ---------- 初期化 ----------
  function bind() {
    $("btn-start").onclick = startDaily;
    $("btn-resume").onclick = () => { mode = "daily"; sess = Session.load(); profile = Rewards.load(); enterSession(); };
    $("btn-test").onclick = openTest;
    $("btn-test-start").onclick = startTest;
    $("btn-test-back").onclick = renderHome;
    $("btn-report").onclick = openReport;
    $("btn-report-back").onclick = renderHome;
    $("btn-report-reset").onclick = () => {
      if (confirm("全学習データを消去します。本当によろしいですか？")) {
        Store.clearAll();
        location.reload();
      }
    };
    $("btn-cards").onclick = openCards;
    $("btn-cards-back").onclick = renderHome;
    $("btn-home").onclick = () => { stopTimer(); renderHome(); };
    $("btn-done-home").onclick = renderHome;
    $("btn-reveal").onclick = revealAnswer;
    $("answer-form").onsubmit = (e) => { e.preventDefault(); submitAnswer(); };
    // フィードバック中のEnter=次へ
    $("answer-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && phase === "feedback") { e.preventDefault(); nextQuestion(); }
    });
  }

  async function init() {
    try {
      await loadData();
    } catch (e) {
      document.body.innerHTML = `<div style="padding:40px;text-align:center">
        データの読み込みに失敗しました。<br>
        file:// では動きません。httpサーバー経由で開いてください。<br>
        例: <code>python3 -m http.server</code></div>`;
      return;
    }
    SRS.migrateTo2Lv();  // 旧Lv1書き写し廃止に伴うLv再編（1回だけ）
    loadShipManifest();  // 画像カード用（非同期・失敗しても動作継続）
    bind();
    renderHome();
  }

  init();
})();
