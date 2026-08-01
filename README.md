# v2.2.1：表示階層改善＋内部ID非表示版

## Apps Script側
変更はありません。

## GitHub側で上書きするファイル

- index.html
- assets/js/home.js
- search.html
- assets/js/search.js
- assets/js/common.js
- assets/js/song.js
- assets/js/event.js
- assets/js/venue.js
- assets/js/rankings.js

## 改善内容

### ホーム「最近歌われた曲」
- 曲カードを白背景へ変更
- イベント見出しの薄紫背景と明確に区別
- 枠線をグレー系へ変更
- 歌唱者の上に区切り線を追加
- ホバー時のみ薄い紫を表示

### 内部IDの非表示
以下の内部管理IDをユーザー画面から外しました。

- 曲ID（S003など）
- イベントID（EV0001など）
- 会場ID（VE0001など）

対象：
- 曲詳細の基本情報
- 曲詳細の歌唱履歴
- イベント詳細の基本情報
- 会場詳細の基本情報
- 検索結果
- 上部検索候補
- ランキング

IDはリンクURLとAPI内部に残るため、ページ遷移・検索・管理処理には影響しません。

## 確認URL

ホーム：
https://xenotopi.github.io/mus-song-database/?build=221

曲詳細：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=221

検索：
https://xenotopi.github.io/mus-song-database/search.html?q=Snow&build=221
