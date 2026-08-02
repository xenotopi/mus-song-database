# v2.8.3：会場ページ キャッシュ完全回避版

## 原因

画面に表示された `venues.map is not a function` は、
v2.8.2の `venue.js` 内には存在しない処理です。

そのため、ブラウザまたはGitHub Pages側で
旧 `venue.js` が読み込まれていた可能性が高い状態でした。

今回はクエリ番号だけでなく、JavaScriptのファイル名自体を変更し、
旧ファイルのキャッシュを完全に回避します。

## GitHub側

### 上書き

- venue.html

### 新規追加

- assets/js/venue-v283.js

古い `assets/js/venue.js` は残したままで問題ありません。

## 確認URL

https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=283

GitHub Pagesのデプロイ完了後に確認してください。
