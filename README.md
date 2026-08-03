# 英検準2級 単語道場 (eiken-pre2-dojo)

中学生の子ども向け・英検準2級（2026-10-03受験）のためのタイピング特訓PWA。

## 仕様（docs/SPEC.md に確定版）
- 入力方式は**タイピングのみ**（4択なし・逃げ場ゼロ）
- 不正解はqueue末尾に再投入 → 全問正解するまで終わらない
- 答えを見るとミス2回分 → その問題が2回再出題
- 1問20秒タイマー
- リロードしてもセッション復帰（localStorage）
- SRS間隔反復（1→3→7→14→30日）
- ごほうびループ: ログインボーナス7日カレンダー・ストリーク倍率・コイン・XP・ランク・カード図鑑12枚
- 週次テスト＋保護者リポート

## データ
- `data/words_pre2.json` — 準2級単語1500語（wordbook-passtan流用）
- `data/idioms_pre2.json` — 準2級頻出熟語362件（複数ソース突合・検証済み）

## 開発
```bash
python3 -m http.server 8931   # ローカル動作確認
node scripts/test_headless.js # コアロジックテスト（38項目）
node scripts/test_dom.js      # jsdom UI統合テスト（26項目）
```
