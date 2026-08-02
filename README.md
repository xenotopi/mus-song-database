# v2.7.1：ホーム読み込み表示修正版

## 原因

`clearLoadingState()`の中で、自分自身を再度呼び出すコードになっていました。

そのため、データ自体は表示されていてボタンも押せる一方で、
`home-section-loading`クラスが解除されず、白いスケルトン表示が残っていました。

## GitHub側で上書き

- index.html
- assets/js/home.js

Apps Script側の変更はありません。

## 確認URL

https://xenotopi.github.io/mus-song-database/index.html?build=271
