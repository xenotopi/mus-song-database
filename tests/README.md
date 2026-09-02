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

## Read-only E2E

主要15ページを実ブラウザで開き、主要DOM、Console error、実在IDの詳細ページ、390px表示の横overflow、主要導線を確認します。
ローカルのWebファイルを一時HTTPサーバーで配信し、Public APIにはGET/JSONPのread-only通信だけを行います。

初回だけPlaywrightを準備します。

```powershell
npm install --prefix tests
npx --prefix tests playwright install chromium
```

実行します。

```powershell
npm --prefix tests run e2e
```

既存のChromeを使用する場合は、ブラウザのインストールを省略して次のように実行できます。

```powershell
$env:MUSDB_E2E_BROWSER_CHANNEL = "chrome"
npm --prefix tests run e2e
```

Public APIがHTTP 429/5xx、通信失敗、タイムアウトになったページは、Webコードの失敗と区別できる理由を付けてSKIPします。
ローカルassetの参照切れ、JavaScript例外、Console error、主要DOM未描画、横overflowはFAILです。
