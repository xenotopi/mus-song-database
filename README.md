# v2.6.2：統計表示調整＋スマホナビ追加

## Apps Script側

変更はありません。

## GitHub側で上書き

- statistics.html
- assets/js/statistics.js
- assets/js/common.js

## 統計画面

- 最多年だけに付いていた背景枠と余白を削除
- すべての棒グラフの開始位置を統一
- 最多年は棒のグラデーションと数値色だけで強調
- 各年の件数を15pxへ拡大
- スマホでも件数が見やすいよう右列を拡張
- 上部の合計・最多年・年平均を30pxへ拡大

## スマホナビ

スマホヘッダー右上にハンバーガーボタンを追加します。

ボタンを押すと以下へ移動できます。

- ホーム
- 曲
- イベント
- 会場
- ランキング
- 統計
- About

メニュー外を押す、リンクを押す、PC幅へ戻すと自動で閉じます。

## 確認URL

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=262

曲詳細（スマホ確認）：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=262
