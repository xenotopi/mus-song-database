# v3.3：統計ダッシュボード強化版

## Apps Script側

以下を丸ごと差し替えてください。

- TrendApi.gs
- CacheApi.gs

保存後、新バージョンとして再デプロイしてください。

`ApiMain.gs`のtrendsルートが既に `getTrendData_()` を呼んでいるため、
ApiMain.gsの変更はありません。

## GitHub側

### 上書き

- statistics.html

### 新規追加

- assets/js/statistics-v330.js

古い `assets/js/statistics.js` は残したままで問題ありません。

## 実装内容

### Chart.js化

- 歌唱記録数
- イベント数
- 年別の重複なし歌唱曲数
- 年別の重複なし利用会場数

をインタラクティブグラフで表示します。

### 表示切り替え

- 棒グラフ
- 推移グラフ

### 公式・ソロ比較

選択中の指標を公式・ソロに分けて年別比較します。

右側に以下も表示します。

- 公式の期間合計と割合
- ソロの期間合計と割合

### 数値一覧

Chart.jsの読み込みに失敗しても、
年別の全体・公式・ソロの数値一覧は表示します。

### 読み込み

Chart.jsは統計ページでのみCDNから読み込みます。
他ページの表示速度には影響しません。

## API確認

`?action=trends&callback=callbackTest`

各年に次の項目があれば正常です。

- performanceCount
- officialPerformanceCount
- soloPerformanceCount
- eventCount
- officialEventCount
- soloEventCount
- uniqueSongCount
- officialUniqueSongCount
- soloUniqueSongCount
- venueCount
- officialVenueCount
- soloVenueCount

## Web確認URL

https://xenotopi.github.io/mus-song-database/statistics.html?build=330
