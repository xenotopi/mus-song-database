# v2.8.5：グラフ数値目盛り＋詳細ページ固定タイトル

## Apps Script側

変更はありません。

## GitHub側で上書き

- song.html
- event.html
- venue.html
- statistics.html
- assets/js/song.js
- assets/js/event.js
- assets/js/venue-v283.js
- assets/js/statistics.js

## GitHub側で新規追加

- assets/js/detail-context.js

---

## グラフ数値目盛り

曲詳細の年別歌唱推移と、統計ページの全グラフへ、
最大値を基準にした実数目盛りを追加しています。

例：

```text
0件　4件　8件　12件　16件
```

統計ページでは選択中の指標に応じて単位が変わります。

- 歌唱記録数：件
- イベント数：件
- 歌唱曲数：曲
- 利用会場数：会場

既存の25％・50％・75％の補助線と対応します。

---

## 詳細ページ固定タイトル

曲・イベント・会場ページでヒーロー部分を通過すると、
通常ヘッダーの下へ現在表示中の名称を固定表示します。

例：

```text
曲｜Snow halation
イベント｜For Smile 韓日友好チャリティーコンサート2012 昼公演
会場｜さいたまスーパーアリーナ
```

右側の「↑ 上へ」でページ先頭へ戻れます。

- ページ上部では非表示
- PC・スマホ対応
- 長い名称は1行で省略表示
- API読込後の名称変更にも追従
- スマホメニューとは重ならない位置へ表示

---

## 確認URL

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=285

イベント：
https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=285

会場：
https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=285

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=285
