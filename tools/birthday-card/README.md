# Birthday card

1080×1350。既存card-sharedのブランド、フォント、描画処理を使用。
投稿catalog・カテゴリ・同期処理には未接続。

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
