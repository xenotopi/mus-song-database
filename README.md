# v2.4.1：イベント詳細ページ復旧版

## 原因

イベントAPIの直接URLは `success:true` で正常でした。

そのためApps Script側ではなく、GitHub側のevent.jsが読み込まれる前に停止していました。
旧event.jsは古いモジュール参照と不要なAPI_URL importを残しており、
共通ファイル更新後にモジュール読込エラーになる可能性がありました。

## Apps Script側

変更はありません。

## GitHub側

以下を同じ階層へ上書きしてください。

- event.html
- assets/js/event.js

## 修正内容

- 不要なAPI_URL importを削除
- api.jsをv2.0.2参照へ統一
- common.jsをv2.4.0参照へ統一
- event.jsのキャッシュ番号をv2.4.1へ更新
- イベント画面上の内部曲IDを非表示
- 読込失敗時には必ずエラー表示へ切り替える

## 確認URL

https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=241
