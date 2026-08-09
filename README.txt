v4.7 STEP14-A
GitHubへそのままアップロードできる版

【上書きするファイル】
1. index.html
2. assets/js/common.js

【変更内容】
ホーム
・EXPLOREをv4.7の主要4入口へ変更
  曲 → songs.html
  イベント → events.html
  場所 → venues.html
  歌唱名義 → singers.html
・横断検索 / ランキング / 年別統計 / いつ振りチェッカーは
  「もっと深く調べる」へ分離
・Today / 豆知識 / 各種既存ホーム機能は維持

共通ナビ
・曲 → songs.html
・イベント → events.html
・会場 → venues.html
・PC / スマホ両方
・STEP13-Bのalias検索候補は維持

【反映方法】
ZIPを解凍し、GitHubで同じパスへ上書きしてください。
PowerShell実行は不要です。

確認:
・ホーム4入口
・上部ナビ 曲/イベント/会場
・スマホハンバーガー
・えみつん / スノハレ等のヘッダー検索候補
