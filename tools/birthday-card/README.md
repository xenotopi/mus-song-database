# Birthday card

1080×1350。既存card-sharedのブランド、フォント、描画処理を使用。
正式カテゴリX08「誕生日」。Birthday Card v1のHTML/CSS/ブラウザJSは変更せず、投稿catalog・同期・共通レンダラーへ接続。

```powershell
node tools/birthday-card/render-birthday-card.cjs --input tools/birthday-card/kotori.example.json --output outputs/birthday-kotori-integrated.png
```

緩やかなアーチ見出し、濃紺の名前と小さい敬称、中央のケーキ、日付の順に配置。
外部画像は使わず、見出し・ケーキ・曲線はインラインSVG。炎だけ黄橙色。
`--cake false` でケーキと周辺の曲線を非表示にできる。以前の `--variant A/B` は
CLI互換のため受け付けるが、現在はどちらも濃紺の名前で表示する。

人物データ：
- `displayName`: 敬称なしの名前（旧 `characterName` も使用可）
- `honorific`: 個別指定可。未指定時はcharacterが「ちゃん」、castが「さん」。空文字指定も可
- `cardType`: character / cast。表示用モードのみで、歌唱データの自動集計は行わない
- `birthday`: MM.DD
- `accentColor`: 既存パレットのCSS変数または既存6桁HEX値（旧 `characterColor` も使用可）

敬称は名前の59%で右側に配置し、長い名前では両者の比率を保って縮小。
集計注記には敬称を付けない。キャストの実データ入力時は、別途承認した集計定義が必要。
今回のDBラベル・値・注記はキャラクター用のままで、声優ソロ系指標への切り替えは未実装。
`kotori.example.json` は2026-09-05の承認済みread-only調査値の比較用スナップショットであり、自動更新されない。
他の人物には別JSONを入力する。URLの同名パラメータでも表示値を差し替え可能。

正規参加曲はregularSingerPatternsへの所属で数える。公式歌唱記録と最多曲は、
対象人物を構成員に含む公式区分のRAW歌唱行で数え、声優ソロ系を含めない。
最多曲が同率の場合は勝手に1曲へ絞らず、入力作成時に同率の扱いを確認する。

## 正式投稿の同期・再生成

投稿管理へカテゴリID `X08`、最多曲の`Song ID`、以下のヘッダーを持つ列を入力する。
列番号には依存しない。Birthday列がない既存シートはX01〜X05の同期を継続できるが、X08行があれば不足としてapplyを拒否する。

| ヘッダー | catalogのbirthdayCardキー | 形式 |
| --- | --- | --- |
| Birthday種別 | mode | character / cast |
| Birthday表示名 | displayName | 敬称なし |
| Birthday敬称 | honorific | ちゃん / さん等、空欄も可 |
| Birthday月日 | birthday | 文字列MM.DD |
| Birthdayカラー | themeColor | 既存の6桁HEX |
| Birthday正規参加曲数 | regularSongCount | 非負整数 |
| Birthday公式歌唱記録数 | officialPerformanceCount | 非負整数 |
| Birthday最多曲名 | topSongName | 公式歌唱最多曲 |
| Birthday最多曲回数 | topSongCount | 非負整数 |
| Birthday集計基準日 | asOf | 文字列YYYY-MM-DD |

Birthdayだけは再現性のため、最小IDカタログに承認済み集計スナップショットを追加保存する。
投稿本文・Analyticsは同期せず、本文解析や描画時の現在値への自動更新もしない。
`mode`→既存`cardType`、`themeColor`→既存`accentColor`へ変換するだけで、人物名による分岐はしない。
character/castのデータは合算しない。castも指定方式を維持するが、個別に集計定義を確認した公式記録を入力すること。
X0021の値は2026-09-05承認済みのキャラクター公式記録で、内田彩の声優ソロ系記録を含まない。
カテゴリマスターのKPIは未指定のため空欄（今回独自に決定しない）。

```powershell
node tools/sync-post-card-catalog.cjs --dry-run --spreadsheet-id <投稿管理Spreadsheet ID>
node tools/sync-post-card-catalog.cjs --apply --spreadsheet-id <投稿管理Spreadsheet ID>
node tools/sync-post-card-catalog.cjs --dry-run --spreadsheet-id <投稿管理Spreadsheet ID>
node tools/render-post-card.cjs --id X0021
node --test tools/birthday-card/catalog-data.test.cjs
```

出力は`outputs/post-card-X0021.png`。同期全件validation→atomic applyを維持。
`register-post-card.cjs`は既存ID参照のフォールバックとして維持し、Birthday項目の入力・更新は投稿管理から同期する。
