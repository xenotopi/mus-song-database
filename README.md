# v2.2：ホームUI改善＋検索クリアボタン修正版

## Apps Script側

変更はありません。

## GitHub側で上書きするファイル

- index.html
- assets/js/home.js
- search.html
- assets/js/search.js

## 改善内容

### ホーム「最近歌われた曲」

- 歌唱者を「歌唱：〇〇」として13pxで表示
- 曲名と歌唱者を縦並びに変更
- PCは2列、スマホは1列
- イベント情報を専用ヘッダーへ整理
- 会場・Day・公演情報を見やすく表示
- ホバー時の視認性を改善
- 「最新5イベント」の補足を追加

### 検索画面

- ブラウザ標準の検索クリアボタンを非表示
- 自作のクリアボタンだけを表示
- ×が2つ並ぶ問題を解消

## 確認URL

ホーム：
https://xenotopi.github.io/mus-song-database/?build=220

検索：
https://xenotopi.github.io/mus-song-database/search.html?q=恋の&build=220

## 確認ポイント

1. 最近歌われた曲の歌唱者が読みやすくなっている
2. PCでは曲カードが2列になる
3. スマホでは1列になる
4. 検索入力欄の×が1つだけ表示される
