# v2.8.7：非表示固定バーのクリック干渉修正

## 原因

スクロール前は固定タイトルバーが透明になっていましたが、
バー内部のクリック判定だけが残っていました。

そのため、ヘッダーナビの上側を透明なバーが覆い、
文字の下側数ミリしかクリックできない状態になっていました。

## GitHub側で上書き

- assets/js/detail-context.js

Apps Script側の変更はありません。

## 修正内容

- 非表示中は `visibility: hidden`
- 非表示中は固定バー内部も `pointer-events: none`
- スクロール後に表示されたときだけクリックを有効化

## 確認URL

https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=287
