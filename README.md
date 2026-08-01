# v2.4：高精度・横断検索強化版

## Apps Script側

丸ごと差し替え：

- SearchApi.gs

ApiMain.gsの変更はありません。

保存後、`testSearchAdvanced`を実行してください。

推奨テスト語：

- 内田
- Snow
- 東京
- Final
- さいたま

ログに以下が含まれれば成功です。

- results.singers
- results.songs
- results.events
- results.venues

その後、新バージョンで再デプロイしてください。

## GitHub側

上書き：

- search.html
- assets/js/search.js
- assets/js/common.js

## 追加機能

### オートコンプリート
- 歌唱者候補を追加
- 曲・イベント・会場・歌唱者を最大6件表示
- 上下キー・Enter操作を継続
- 歌唱者候補から横断検索へ移動

### 検索精度
- 完全一致を最優先
- 前方一致を次点
- 単語先頭一致
- 部分一致
- 大文字小文字を吸収
- 全角半角を吸収
- 空白・中黒・記号差を吸収

### 横断検索
- 曲名 → その曲が歌われたイベント
- イベント名 → 披露曲・開催会場
- 会場名・地域名 → その会場のイベント
- 歌唱者名 → 歌唱曲・出演イベント
- 検索理由を結果に表示

## JSONP確認

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=search&q=内田&callback=callbackTest

## 公開確認

https://xenotopi.github.io/mus-song-database/search.html?q=内田&build=240
