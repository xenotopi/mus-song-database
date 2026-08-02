# v2.8.2：会場エラー修正＋統計表記・補助線調整

## Apps Script側

変更はありません。

## GitHub側で上書き

- venue.html
- assets/js/venue.js
- song.html
- statistics.html
- assets/js/statistics.js

## 会場詳細

`venues.map is not a function`を防ぐため、返却データの形式を確認してから会場一覧を生成します。

- 配列形式に対応
- `{ items: [...] }`形式にも対応
- 不正な会場データを除外
- 関連データAPIだけ失敗しても会場基本情報は表示
- 会場一覧を取得できない場合は現在の会場だけ表示

## 曲詳細グラフ

年別歌唱推移の背景に25%・50%・75%の補助線を追加しました。

## 統計

### 表記

- 年別の歌唱曲数（重複なし）
- 年別の利用会場数（重複なし）

### 説明文

グラフ見出しの右側から見出し直下へ移動し、不自然な1文字改行を防ぎます。

統計グラフには既存の25%刻み補助線を維持しています。

## 確認URL

会場：
https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=282

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=282

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=282
