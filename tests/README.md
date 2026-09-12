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

主要17ページを実ブラウザで開き、主要DOM、Console error、実在IDの詳細ページ、390px表示の横overflow、主要導線を確認します。
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

## Search API contract

Public Search APIのalias、重要な曲順位、曲以外のカテゴリ検索をread-onlyで確認します。
実データの追加で変わりやすい総件数は固定せず、既知対象の包含、alias情報、重要な先頭順位だけを検証します。

```powershell
npm --prefix tests run contract:search
```

APIの通信失敗、タイムアウト、HTTP 429/5xxは理由付きSKIPです。
HTTP 200でのレスポンス形式不正、対象欠落、aliasまたは順位の仕様違反はFAILです。

検索結果ページと共通ヘッダー候補のRelease表示、カテゴリ切替、長文・XSS・欠損互換、キーボード操作、390px表示はローカルfixtureで確認します。

```powershell
npm --prefix tests run e2e:search-release
```

JSONPのtimeout後に遅延応答が到着する通信lifecycle、callbackの安全な破棄、Headerの限定retry設定は次で確認します。

```powershell
npm --prefix tests run test:api-jsonp
```

## Release list E2E

Release一覧の描画、検索・大分類→リリース種別の2段階filter・年・並び順、URL状態復元、不正query正規化、pagination、エラー再試行、390px表示を確認します。
Public APIのreleaseListをNodeからread-only取得してブラウザへfixtureとして渡し、実データに対するUI挙動を安定して確認します。

```powershell
npm --prefix tests run e2e:release
```

Release詳細のreleaseType、条件付きrelatedEvents、Event導線、複数Event順序、0曲状態、欠損表示、エラー処理、一覧との相互遷移は次で確認します。

```powershell
npm --prefix tests run e2e:release-detail
```

Event詳細のrelatedReleases表示、0件非表示、API順、Release導線、長文・XSS・不正ID・390px表示は次で確認します。

```powershell
npm --prefix tests run e2e:event-release
```

曲詳細の既存収録作品表示と、Song APIの `debutRelease.releaseId` を使ったRelease詳細との相互リンクは次で確認します。

```powershell
npm --prefix tests run e2e:song-release
```

共通ナビの項目順、Release active状態、PC幅での非衝突、モバイルドロワーの開閉は次で確認します。

```powershell
npm --prefix tests run e2e:navigation
```

## Home Today Release E2E

Home APIの`today.releases`を使った発売記念日表示、API周年値、0件・複数件・最大6件、長文・escape、既存Todayカテゴリ、HomeからRelease詳細への往復、390px表示をローカルfixtureで確認します。

```powershell
npm --prefix tests run e2e:home-today-release
```

## Detail SEO / sitemap

Song・Release詳細のindex方針、Releaseの自己参照canonical基盤、sitemapのURL件数・重複・形式を確認します。

```powershell
npm --prefix tests run test:seo-indexing
npm --prefix tests run sitemap:check
```

`sitemap.xml`は本番Public APIの`releaseList`と`rankings.songs`を正式なID一覧として生成します。

```powershell
node tools/generate-sitemap.cjs
```
