# v2.8.1：曲グラフ表示修正＋統計表記明確化

## Apps Script側

変更はありません。

## GitHub側で上書き

- song.html
- statistics.html
- assets/js/statistics.js

## 曲詳細の修正

### 年別歌唱推移

棒が空白だった原因は、棒の要素がインライン要素のままで、
JavaScriptが指定した横幅が反映されていなかったためです。

`display: block`を追加し、件数に応じて棒が表示されるよう修正しています。

### 関連曲の表記

変更前：

- 同じ作品・区分の曲

変更後：

- 条件が近い関連曲
- 同じ収録CD・メディア・区分をもとに表示しています。

## 統計の修正

選択中のタブに応じて、サマリーカードの見出しを具体化します。

例：歌唱記録数

- 期間中の延べ歌唱記録数合計
- 歌唱記録数が最多の年
- 1年あたりの平均歌唱記録数

例：イベント数

- 期間中の登録イベント数合計
- イベント数が最多の年
- 1年あたりの平均イベント数

例：歌唱曲数

- 各年の歌唱曲数合計
- 歌唱曲数が最多の年
- 1年あたりの平均歌唱曲数

また、各グラフに集計方法の説明文を表示します。

## 確認URL

曲：

https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=281

統計：

https://xenotopi.github.io/mus-song-database/statistics.html?build=281
