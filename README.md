# v2.8.6：詳細ナビ整理＋固定タイトル位置＋統計目盛り修正

## Apps Script側

変更はありません。

## GitHub側で上書き

- song.html
- event.html
- venue.html
- statistics.html
- assets/js/detail-context.js

## 修正内容

### 1. ページ内ナビを非表示

曲・イベント・会場詳細にあった次のようなページ内ナビを非表示にしました。

- 基本情報
- この曲・イベント・会場を巡る
- 発見
- 開催イベント
- 披露曲
- 歌唱履歴

利用頻度が低く、スマホだけ追従する挙動も分かりにくかったため、
画面上から整理しています。

### 2. 固定タイトルを最上部へ

スクロール時に表示される曲名・イベント名・会場名を、
通常ヘッダーより上の画面最上部へ表示します。

### 3. 統計グラフの目盛り

目盛りが横一列に詰まって表示される問題を修正しました。

修正後はグラフ幅に合わせて、

0件 / 69件 / 138件 / 206件 / 275件

のように均等配置されます。

また、目盛り上部の不要な余白も削減しています。

## 確認URL

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=286

イベント：
https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=286

会場：
https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=286

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=286
