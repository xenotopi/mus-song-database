# v3.1：イベント全件ナビ＋初披露・最終披露判定修正版

## Apps Script側

以下を丸ごと差し替えてください。

- EventApi.gs
- DiscoverApi.gs
- CacheApi.gs

保存後、新バージョンとして再デプロイしてください。

## GitHub側

### 上書き

- event.html
- assets/js/detail-context.js

### 新規追加

- assets/js/event-v310.js

古い `assets/js/event.js` は残したままで問題ありません。

---

## 修正1：イベントプルダウンを全件化

旧仕様は前・現在・次の最大3件だけをWeb側へ返していました。

v3.1ではEvent APIの `navigation.events` に、
イベントマスターの全登録イベントを日付順で返します。

同日イベントはイベントID順です。

プルダウンには次を表示します。

- 開催日
- イベント名
- Day
- 公演

内部IDは画面へ表示しません。

---

## 修正2：初披露・最終披露判定

旧判定は日付だけで比較していたため、
同じ日に複数イベントがある場合は複数イベントが
初披露・最終披露として扱われる可能性がありました。

v3.1では全イベントを

1. 開催日
2. イベントID

の順で並べ、曲ごとの最初・最後のイベントIDを判定します。

全歌唱RAWを対象に判定します。

---

## 修正3：件数上限を撤去

Discover APIの初披露・最終披露・このイベントのみ曲にあった
`slice(0, 10)`を撤去しました。

該当曲が10曲を超えるイベントでも全件を返します。

---

## API確認

イベント詳細：

`?action=event&id=EV0002&callback=callbackTest`

次を確認してください。

- `navigation.totalCount` が346前後
- `navigation.events` に全イベントがある

イベント発見：

`?action=discover&type=event&id=EV0002&callback=callbackTest`

次を確認してください。

- `firstPerformedSongs`
- `lastPerformedSongs`
- `uniqueSongs`

## Web確認URL

https://xenotopi.github.io/mus-song-database/event.html?id=EV0002&build=310
