// rewards.js — コイン・XP・ランク・ストリーク・7日ログインボーナス・軍艦図鑑
// 軍艦データ出典: 大日本帝国海軍 連合艦隊ww2 全艦艇一覧
// https://xn--ww2-523es33s4hr4hk.jp/list-warships.htm
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

  // 連合艦隊60隻 — 配属順: 駆逐艦(16)→軽巡(8)→重巡(10)→潜水艦(4)→空母(12)→戦艦(10)
  // 最後の1隻は大和（60日目＝約2カ月でコンプ）
  const FLEET = [
    // ===== 駆逐艦 =====
    { id: "dd01", name: "雪風", type: "駆逐艦", note: "激戦を生き抜いた奇跡の幸運艦" },
    { id: "dd02", name: "島風", type: "駆逐艦", note: "時速40ノット超の世界最速駆逐艦" },
    { id: "dd03", name: "時雨", type: "駆逐艦", note: "スリガオ海峡を生き延びた幸運艦" },
    { id: "dd04", name: "響", type: "駆逐艦", note: "戦後まで残った暁型の生き残り" },
    { id: "dd05", name: "雷", type: "駆逐艦", note: "敵の遭難者を救助した優しい艦" },
    { id: "dd06", name: "電", type: "駆逐艦", note: "雷と姉妹の第六駆逐隊" },
    { id: "dd07", name: "暁", type: "駆逐艦", note: "「暁に祈る」の第一艦" },
    { id: "dd08", name: "綾波", type: "駆逐艦", note: "夜戦の鬼神と呼ばれた特型" },
    { id: "dd09", name: "吹雪", type: "駆逐艦", note: "世界を驚かせた特型駆逐艦" },
    { id: "dd10", name: "陽炎", type: "駆逐艦", note: "艦隊決戦の主役・陽炎型" },
    { id: "dd11", name: "夕立", type: "駆逐艦", note: "ソロモン夜戦の突撃艦" },
    { id: "dd12", name: "白露", type: "駆逐艦", note: "白露型のネームシップ" },
    { id: "dd13", name: "秋月", type: "駆逐艦", note: "艦隊を守る防空駆逐艦" },
    { id: "dd14", name: "朝潮", type: "駆逐艦", note: "朝潮型のネームシップ" },
    { id: "dd15", name: "長波", type: "駆逐艦", note: "輸送作戦で活躍した夕雲型" },
    { id: "dd16", name: "初霜", type: "駆逐艦", note: "開戦から終戦まで生き残った" },
    // ===== 軽巡洋艦 =====
    { id: "cl01", name: "矢矧", type: "軽巡洋艦", note: "大和の最期出撃を護衛" },
    { id: "cl02", name: "能代", type: "軽巡洋艦", note: "水雷戦隊の旗艦を務めた阿賀野型" },
    { id: "cl03", name: "阿武隈", type: "軽巡洋艦", note: "真珠湾攻撃の護衛に参加" },
    { id: "cl04", name: "神通", type: "軽巡洋艦", note: "川内型・夜戦の名艦" },
    { id: "cl05", name: "北上", type: "軽巡洋艦", note: "重雷装艦から回天母艦へ改造" },
    { id: "cl06", name: "大井", type: "軽巡洋艦", note: "北上と並ぶ重雷装艦" },
    { id: "cl07", name: "天龍", type: "軽巡洋艦", note: "小型ながら勇敢な天龍型" },
    { id: "cl08", name: "夕張", type: "軽巡洋艦", note: "コンパクト設計の名艦" },
    // ===== 重巡洋艦 =====
    { id: "ca01", name: "高雄", type: "重巡洋艦", note: "高雄型のネームシップ" },
    { id: "ca02", name: "愛宕", type: "重巡洋艦", note: "栗田艦隊の旗艦" },
    { id: "ca03", name: "摩耶", type: "重巡洋艦", note: "防空巡洋艦に改装" },
    { id: "ca04", name: "鳥海", type: "重巡洋艦", note: "サマール島沖で奮戦" },
    { id: "ca05", name: "妙高", type: "重巡洋艦", note: "妙高型のネームシップ" },
    { id: "ca06", name: "羽黒", type: "重巡洋艦", note: "マラッカ海峡海戦で戦没" },
    { id: "ca07", name: "那智", type: "重巡洋艦", note: "マニラ湾で空襲により沈没" },
    { id: "ca08", name: "足柄", type: "重巡洋艦", note: "バンカ海峡で潜水艦に撃沈" },
    { id: "ca09", name: "最上", type: "重巡洋艦", note: "軽巡から重巡に改装された最上型" },
    { id: "ca10", name: "利根", type: "重巡洋艦", note: "艦載機による偵察が得意" },
    // ===== 潜水艦 =====
    { id: "ss01", name: "伊400", type: "潜水艦", note: "世界最大の潜水空母" },
    { id: "ss02", name: "伊401", type: "潜水艦", note: "伊400型の2番艦" },
    { id: "ss03", name: "伊168", type: "潜水艦", note: "ヨークタウンを撃沈" },
    { id: "ss04", name: "伊58", type: "潜水艦", note: "インディアナポリスを撃沈" },
    // ===== 航空母艦 =====
    { id: "cv01", name: "鳳翔", type: "空母", note: "世界初の航空母艦" },
    { id: "cv02", name: "赤城", type: "空母", note: "第一航空艦隊の旗艦" },
    { id: "cv03", name: "加賀", type: "空母", note: "戦艦から改装された大型空母" },
    { id: "cv04", name: "蒼龍", type: "空母", note: "ミッドウェー海戦で戦没" },
    { id: "cv05", name: "飛龍", type: "空母", note: "ミッドウェーで反撃した勇艦" },
    { id: "cv06", name: "翔鶴", type: "空母", note: "翔鶴型のネームシップ" },
    { id: "cv07", name: "瑞鶴", type: "空母", note: "開戦からレイテまで転戦" },
    { id: "cv08", name: "隼鷹", type: "空母", note: "客船から改装された空母" },
    { id: "cv09", name: "大鳳", type: "空母", note: "装甲飛行甲板の新型空母" },
    { id: "cv10", name: "信濃", type: "空母", note: "大和型船体の世界最大空母" },
    { id: "cv11", name: "龍驤", type: "空母", note: "小型ながら空襲に耐えた" },
    { id: "cv12", name: "雲龍", type: "空母", note: "雲龍型のネームシップ" },
    // ===== 戦艦 =====
    { id: "bb01", name: "長門", type: "戦艦", note: "連合艦隊の旗艦・国民的人気艦" },
    { id: "bb02", name: "陸奥", type: "戦艦", note: "長門の姉妹艦・柱島泊地で爆沈" },
    { id: "bb03", name: "金剛", type: "戦艦", note: "高速戦艦の一番艦" },
    { id: "bb04", name: "比叡", type: "戦艦", note: "ガダルカナルで奮戦" },
    { id: "bb05", name: "榛名", type: "戦艦", note: "開戦から終戦まで転戦" },
    { id: "bb06", name: "霧島", type: "戦艦", note: "ガダルカナル夜戦で戦没" },
    { id: "bb07", name: "扶桑", type: "戦艦", note: "扶桑型のネームシップ" },
    { id: "bb08", name: "山城", type: "戦艦", note: "スリガオ海峡で奮戦" },
    { id: "bb09", name: "武蔵", type: "戦艦", note: "シブヤン海で戦没した大和型" },
    { id: "bb10", name: "大和", type: "戦艦", note: "世界最大の戦艦・最後の一隻" },
  ];

  // ===== 配属ルール（Lv制対応 v2）=====
  // 通常艦: 駆逐艦(16)+軽巡(8)+重巡(10)=34隻 → 毎日のセッション完走で1日1隻（従来どおり）
  // レア艦: 潜水艦(4)+空母(12)+戦艦(10)=26隻 → Lv3クリア（本番難易度で正解）した語数の累計で解放
  const REGULAR_COUNT = 34;             // FLEET先頭34隻が通常枠
  const RARE_FIRST = 25;                // 初のレア艦解放に必要なLv3クリア語数
  const RARE_STEP = 25;                 // 以降この語数ごとに1隻（大和=650語）

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
      ships: [],                   // 配属済み軍艦ID
      shipLastAward: null,         // 最後に艦を配属した日（1日1隻制限）
      lv3Mastered: [],             // Lv3クリア済みの項目ID（レア艦解放の原資）
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

  // 次の通常艦（駆逐/軽巡/重巡）。全て配属済みならnull
  function nextRegularShip(p) {
    for (let i = 0; i < REGULAR_COUNT; i++) {
      if (!p.ships.includes(FLEET[i].id)) return FLEET[i];
    }
    return null;
  }

  // 次の未配属レア艦（潜水/空母/戦艦）。全て配属済みならnull
  function nextUnownedRare(p) {
    for (let i = REGULAR_COUNT; i < FLEET.length; i++) {
      if (!p.ships.includes(FLEET[i].id)) return FLEET[i];
    }
    return null;
  }

  // Lv3クリア累計n語で解放されるべきレア艦の数
  function entitledRares(masteredCount) {
    if (masteredCount < RARE_FIRST) return 0;
    return Math.min(FLEET.length - REGULAR_COUNT, Math.floor((masteredCount - RARE_FIRST) / RARE_STEP) + 1);
  }

  // レア艦の解放条件語数（FLEET配列インデックス≥REGULAR_COUNT用）
  function rareThreshold(fleetIdx) {
    return RARE_FIRST + (fleetIdx - REGULAR_COUNT) * RARE_STEP;
  }

  // 次のレア艦解放に必要な語数。全て解放済みならnull
  function nextRareThreshold(p) {
    const nr = nextUnownedRare(p);
    if (!nr) return null;
    return rareThreshold(FLEET.indexOf(nr));
  }

  // 解放条件を満たしたレア艦を一括配属。戻り値=新規配属艦の配列
  function awardEarnedRares(p) {
    const entitled = entitledRares(p.lv3Mastered.length);
    const unlocked = [];
    for (let r = 0; r < entitled; r++) {
      const ship = FLEET[REGULAR_COUNT + r];
      if (!p.ships.includes(ship.id)) {
        p.ships.push(ship.id);
        unlocked.push(ship);
      }
    }
    if (unlocked.length) save(p);
    return unlocked;
  }

  // Lv3クリア記録（重複なし）。戻り値=解放されたレア艦の配列
  function recordLv3Clear(p, id) {
    if (p.lv3Mastered.includes(id)) return [];
    p.lv3Mastered.push(id);
    const unlocked = awardEarnedRares(p);
    save(p);
    return unlocked;
  }

  // 艦を1隻配属（通常艦優先・枯渇後はレア艦）。戻り値: 配属した艦 or null
  function awardShip(p) {
    const ship = nextRegularShip(p) || nextUnownedRare(p);
    if (!ship) return null;
    p.ships.push(ship.id);
    save(p);
    return ship;
  }

  // 学習開始時: ストリーク更新 + ログインボーナス判定。戻り値 = 獲得ボーナス情報
  function touchStudy(p, today) {
    const ev = { streakUp: false, bonus: null, ship: null };
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
      if (p.calendarDay === 7) {
        // 7日目: 大ボーナス + レア艦1隻追加配属
        p.coins += 100;
        ev.bonus = { day: 7, coins: 100, rare: true };
        ev.ship = awardShip(p);
      } else {
        p.coins += 20;
        ev.bonus = { day: p.calendarDay, coins: 20, rare: false };
      }
    }
    save(p);
    return ev;
  }

  // Lv別報酬: Lv1=10枚 Lv2=15枚 Lv3=20枚（×ストリーク倍率）
  const LV_COINS = [0, 10, 15, 20];
  const LV_XP = [0, 3, 4, 6];

  function onAnswer(p, isCorrect, kind, lv = 1) {
    if (isCorrect) {
      p.totalCorrect++;
      p.coins += LV_COINS[lv] * multiplier(p.streak);
      p.xp += LV_XP[lv];
      if (kind === "idiom") p.idiomCorrect++;
      else p.wordCorrect++;
    } else {
      p.totalWrong++;
    }
  }

  // セッション完走報酬。戻り値 = 配属された艦（1日1隻・なしならnull）
  function onSessionDone(p, stats, today) {
    if (!stats.done) return null;
    p.sessionsDone++;
    p.coins += 50;
    p.xp += 30;
    if (stats.wrong === 0) { p.flawless++; p.coins += 50; }
    p.history.push({
      date: today, correct: stats.correct, wrong: stats.wrong,
      done: stats.done,
    });
    if (p.history.length > 60) p.history.shift();
    let awarded = null;
    if (p.shipLastAward !== today) {
      // 完走配属は通常艦（駆逐/軽巡/重巡）のみ。レア艦はLv3クリア専用
      awarded = nextRegularShip(p);
      if (awarded) {
        p.ships.push(awarded.id);
        p.shipLastAward = today;
        save(p);
      }
    }
    return awarded;
  }

  function flush(p) { save(p); }

  return {
    load, save, defaults, rankOf, nextRank, multiplier,
    touchStudy, onAnswer, onSessionDone, flush,
    awardShip, recordLv3Clear, awardEarnedRares,
    nextRareThreshold, entitledRares,
    REGULAR_COUNT, RARE_FIRST, RARE_STEP,
    RANKS, FLEET,
  };
})();
