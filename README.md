# v2.6 Discover Update

ランダム探索は実装していません。

## Apps Script側

### 丸ごと差し替え

- ApiMain.gs
- HomeApi.gs

### 新規追加

- DiscoverApi.gs

保存後、次を実行してください。

1. `testDiscoverResponse`
2. エラーがなければ新バージョンで再デプロイ
3. アクセス権は「全員」を維持

## API確認

曲の関連データ：

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=discover&type=song&id=S003&callback=callbackTest

年別統計：

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=trends&callback=callbackTest

About：

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=about&callback=callbackTest

## GitHub側で上書き

- index.html
- song.html
- event.html
- venue.html
- assets/js/home.js
- assets/js/song.js
- assets/js/event.js
- assets/js/venue.js
- assets/js/common.js

## GitHub側で新規追加

- statistics.html
- about.html
- assets/js/statistics.js
- assets/js/about.js

## 実装内容

### Today in μ's

- この日に開催されたイベント
- この日に発売された曲
- この日に初披露された曲
- この日に最後に歌われた曲

### 今日の発見

日付を固定キーにした日替わり表示です。
ページ再読み込みごとに変わるランダム表示ではありません。

- 今日の曲
- 今日のイベント
- 今日の会場

### 関連データ

曲詳細：

- 一緒に歌われた曲 TOP5
- よく歌われた会場 TOP5

イベント詳細：

- このイベントだけで歌われた曲
- このイベントで初披露された曲

会場詳細：

- 初開催イベント
- 最終開催イベント
- この会場で初披露された曲

### 統計・グラフ

外部ライブラリを使わず、CSSバーグラフで実装しています。

- 年別歌唱記録数
- 年別イベント数
- 年別歌唱曲数
- 年別利用会場数

### About

- サイトの目的
- データ方針
- 注意事項
- 登録件数
- 収録期間
- API確認日時

## 公開確認URL

ホーム：
https://xenotopi.github.io/mus-song-database/?build=260

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=260

イベント：
https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=260

会場：
https://xenotopi.github.io/mus-song-database/venue.html?id=VE0004&build=260

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=260

About：
https://xenotopi.github.io/mus-song-database/about.html?build=260
