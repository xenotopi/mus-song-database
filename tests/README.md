# Web smoke tests

公開HTMLから到達する現役JS/CSSと、TodayのJST日付境界をローカルで検証する最小テストです。
カード生成ツールとは独立しており、ネットワーク接続や本番APIへの書き込みは行いません。

## 実行

リポジトリルートで実行します。

```powershell
node --test tests/web-smoke.test.cjs
```

## active entrypointの更新

公開HTMLの`script src`、インラインmodule import、またはstylesheet参照を変更した場合だけ、
`active-entrypoints.json`を実際の参照に合わせて更新します。
テストはHTMLから取得した直接entrypointと、JSの再帰importから取得した現役モジュールを一覧と照合します。

旧版JSを削除する前にこのテストを実行し、削除対象が`activeJavaScript`に含まれていないことを確認してください。
