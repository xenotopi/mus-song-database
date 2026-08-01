# v2.0 Foundation：Venue API＋会場詳細JSONP対応版

## 1. Apps Script側

### 新規追加

- VenueApi.gs

### 丸ごと差し替え

- ApiMain.gs

既存の以下は変更しません。

- Config.gs
- ApiResponse.gs
- SongApi.gs
- EventApi.gs
- SearchApi.gs

## 2. Apps Scriptテスト

`testGetVenueDetail`を実行します。

会場情報・statistics・events・topSongs・navigationが
実行ログに表示されれば成功です。

## 3. 新バージョンで再デプロイ

デプロイ → デプロイを管理 → 鉛筆 → 新バージョン → デプロイ

## 4. JSONP直接確認

次を開きます。

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=venue&id=VE0002&callback=callbackTest

先頭が以下なら成功です。

callbackTest({"success":true,...

## 5. GitHub側

githubフォルダ内を同じ階層で上書きします。

- venue.html
- assets/js/venue.js

## 6. 公開確認

https://xenotopi.github.io/mus-song-database/venue.html?id=VE0002&build=203

表示内容：

- 会場基本情報
- 利用統計
- 初回・最終開催日
- 開催イベント一覧
- 会場内の歌唱曲ランキング
- 前後会場ナビ
