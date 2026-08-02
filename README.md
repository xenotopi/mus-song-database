# v2.8：曲詳細強化＋会場クイックナビ追加

## Apps Script側

### 丸ごと差し替え

- DiscoverApi.gs
- CacheApi.gs

`CacheApi.gs`はキャッシュバージョンをv2.8.0へ更新しています。
旧Discover APIのキャッシュを自動的に参照しなくなります。

保存後、新バージョンとして再デプロイしてください。

### API確認

曲：

`?action=discover&type=song&id=S003&callback=callbackTest`

次が含まれていれば成功です。

- navigation
- relatedSongs
- topSingers
- topVenues
- coPerformedSongs

会場：

`?action=discover&type=venue&id=VE0004&callback=callbackTest`

次が含まれていれば成功です。

- navigation.previous
- navigation.next
- navigation.venues

## GitHub側

以下を上書きしてください。

- song.html
- venue.html
- assets/js/song.js
- assets/js/venue.js

## 曲詳細の追加内容

### この曲の記録

- 最多歌唱年
- 最長ブランク
- 公式イベント比率
- ソロイベント比率

### 歌唱データ分析

- 年別歌唱推移
- 歌唱名義ランキングTOP5
- 同じ収録CD・メディア・区分の関連曲

既存の以下も維持しています。

- 前後曲
- 曲プルダウン
- この曲を巡る
- 一緒に歌われた曲
- よく歌われた会場
- 歌唱履歴フィルター

## 会場クイックナビ

会場詳細上部を次の構成に変更します。

- 前の会場
- 会場を選ぶプルダウン
- 次の会場

PCでは3列、スマホではプルダウンを上段、前後会場を下段に表示します。

会場名に加えて都道府県・都市・国もプルダウン内へ表示するため、
同名・類似名の会場も区別しやすくしています。

## 確認URL

曲：

https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=280

会場：

https://xenotopi.github.io/mus-song-database/venue.html?id=VE0004&build=280
