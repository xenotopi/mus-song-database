# v2.5：UIブラッシュアップ＆回遊性強化

## Apps Script側

変更はありません。

## GitHub側で上書きするファイル

- song.html
- event.html
- venue.html
- assets/js/song.js
- assets/js/event.js
- assets/js/venue.js
- assets/js/common.js

## 共通UI改善

- 長いページに「TOP」ボタンを追加
- 詳細ページ上部に固定型のページ内ナビゲーションを追加
- カードのホバー表示と回遊導線を統一
- スマホではページ内ナビゲーションを横スクロール可能に調整

## 曲詳細

- 「この曲を巡る」を追加
  - 初披露イベント
  - 最新歌唱イベント
  - 最多歌唱者
- 歌唱履歴に「すべて・公式・ソロ」フィルター
- 最初は20件表示し、20件ずつ追加する「もっと見る」
- 内部IDは非表示のまま維持

## イベント詳細

- 「このイベントを巡る」を追加
  - 会場
  - 披露曲の先頭
  - 前後イベント
- ページ内ナビゲーションから基本情報・会場・披露曲へ移動
- 既存の前後イベントナビゲーションは維持

## 会場詳細

- 「この会場を巡る」を追加
  - 最新イベント
  - 最多歌唱曲
  - 前後会場
- 開催イベントを最初は10件表示
- 10件ずつ追加する「もっと見る」

## 確認URL

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=250

イベント：
https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=250

会場：
https://xenotopi.github.io/mus-song-database/venue.html?id=VE0004&build=250
