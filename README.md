# v3.2：ランキングページ強化版

## Apps Script側

以下を丸ごと差し替えてください。

- RankingApi.gs
- ApiMain.gs
- CacheApi.gs

保存後、新バージョンとして再デプロイしてください。

## GitHub側

### 上書き

- rankings.html

### 新規追加

- assets/js/rankings-v320.js

古い `assets/js/rankings.js` は残したままで問題ありません。

---

## 追加内容

### 4種類のランキング

- 曲
- イベント
- 会場
- 歌唱名義

歌唱名義は歌唱RAWに登録された文字列を、そのまま1名義として集計します。

### 全体フィルター

- 全期間 / 年別
- 公式・ソロすべて
- 公式のみ
- ソロのみ

年・区分を変更するとAPIから再集計します。

### ランキング内検索

表示中の種類に応じて、次を検索します。

- 曲名・メディア・区分
- イベント名・イベント種別
- 会場名・地域・国
- 歌唱名義

### 並べ替え

曲：
- 歌唱記録数
- 歌唱イベント数
- 初披露日
- 最終披露日
- 曲名

イベント：
- 歌唱曲数
- 歌唱記録数
- 延べ歌唱人数
- 開催日

会場：
- 開催イベント数
- 歌唱記録数
- 歌唱曲数
- 会場名

歌唱名義：
- 歌唱記録数
- 歌唱曲数
- 出演イベント数
- 名義順

### URL保持

例：

`rankings.html?type=songs&year=2015&category=公式&sort=performance-desc`

検索・タブ・年・区分・並べ替えをURLへ保持します。

### 表示件数

初期50件、以降50件ずつ「もっと見る」で表示します。

---

## API確認

`?action=rankings&limit=1000&year=2015&category=公式&callback=callbackTest`

確認項目：

- filters.availableYears
- summary
- songs
- events
- venues
- singers

## Web確認URL

https://xenotopi.github.io/mus-song-database/rankings.html?build=320
