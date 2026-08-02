# v2.6.3：スマホナビ完全修正版

## Apps Script側

変更はありません。

## GitHub側

`github`フォルダ内を同じ階層へすべて上書きしてください。

### HTML

- index.html
- song.html
- event.html
- venue.html
- search.html
- rankings.html
- statistics.html
- about.html

### JavaScript

- assets/js/common.js
- assets/js/home.js
- assets/js/song.js
- assets/js/event.js
- assets/js/venue.js
- assets/js/search.js
- assets/js/rankings.js
- assets/js/statistics.js
- assets/js/about.js

## 今回ファイル数が多い理由

前回は `common.js` だけを更新しましたが、各ページのJavaScriptが
`common.js?v=2.6.0` など古いURLを参照していたため、
スマホではブラウザキャッシュから旧ヘッダーが読み込まれる場合がありました。

今回は以下をすべて `v2.6.3` に統一しています。

1. HTML → 各ページJavaScript
2. 各ページJavaScript → common.js
3. common.js本体

これにより古い共通ヘッダーを参照しません。

## スマホナビの仕様

画面幅820px以下で、ヘッダー右上に三本線ボタンを表示します。

開くと右側からメニューが表示されます。

- ホーム
- 曲
- イベント
- 会場
- ランキング
- 統計
- About

以下の操作で閉じます。

- ×ボタン
- 背景部分のタップ
- メニュー項目の選択
- Escapeキー
- PC幅への変更

## 確認URL

スマホで次のURLを開いてください。

https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=263

右上に三本線ボタンが表示されれば成功です。
