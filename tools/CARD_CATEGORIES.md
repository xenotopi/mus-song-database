# 投稿カードカテゴリ

`post-card-catalog.json`には、投稿管理に存在する実投稿IDだけを登録する。
試作・描画確認用データは`fixtures/post-card-fixtures.json`へ分離し、`--fixture`で生成する。

| カテゴリID | カード種別 | テンプレート |
| --- | --- | --- |
| X01 | Today | `today-card` |
| X02 | 楽曲記録 | `song-record-card` |
| X03 | いつ振り／ブランク | `blank-card` |
| X04 | ランキング | `ranking-card` |
| X05 | イベント／会場記録 | `event-venue-card` |

X03のブランクランキングはX03の集計ロジックを使い、TOP5表示部分のみ汎用`ranking-card`を再利用する。
X05はEvent IDまたはVenue IDのどちらか一方だけを持つ。両方指定は曖昧入力として拒否する。

## fixture生成例

```powershell
node tools/render-post-card.cjs --fixture blank-ranking --scope all
node tools/render-post-card.cjs --fixture blank-ranking --scope official
node tools/render-post-card.cjs --fixture blank-ranking --scope solo
node tools/render-post-card.cjs --fixture event-record
```
