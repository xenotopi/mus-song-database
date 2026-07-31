# μ's Song Database v2.0 Foundation — Event Detail Recovery

GitHubリポジトリへ、フォルダ構成のまま上書きしてください。

上書き対象:
- event.html
- assets/css/style.css
- assets/js/api.js
- assets/js/common.js
- assets/js/event.js

確認URL:
https://xenotopi.github.io/mus-song-database/event.html?id=EV0002

変更点:
- API通信を共通api.jsへ集約
- タイムアウト・自動再試行・キャッシュ回避を追加
- event.jsへ表示処理を分離
- Failed to fetch時の再試行ボタンと診断情報を追加
- 前後イベント、会場、披露曲の導線を復元
- CSS/JSへバージョンクエリを付け、GitHub Pagesの旧キャッシュを回避
