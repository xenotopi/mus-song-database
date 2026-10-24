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

Release一覧114件の描画、Solo Liveシリーズ／個別盤メタデータ、検索・大分類→リリース種別の2段階filter・年・並び順、URL状態復元、不正query正規化、pagination、エラー再試行、390px表示を確認します。
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

Song・Release詳細のindex方針、Releaseの自己参照canonical基盤、Release 114件・Song 117件・静的10件からなるsitemap（全241 URL）の重複・形式を確認します。

```powershell
npm --prefix tests run test:seo-indexing
npm --prefix tests run sitemap:check
```

`sitemap.xml`は本番Public APIの`releaseList`と`rankings.songs`を正式なID一覧として生成します。

```powershell
node tools/generate-sitemap.cjs
```

## Detail QA reuse foundation

`helpers/detail-document-contract.cjs`は保存HTMLと実行後DOMを別契約で検査します。
`helpers/detail-browser-contract.cjs`はRelease/Song別の既存component、スクロールナビ、
Discの初期open状態の保存・summary操作による復元、通信診断、Singer応答採取を提供します。
`helpers/qa-run-context.cjs`は明示的な実行計画、SHA/Revision/入力hash、承認済みdirty、
一意のsourceRunと上書き禁止の証拠保存を扱います。importだけでは通信・保存・ブラウザ起動しません。

静的原本には正式validatorを適用し、runtime要素が保存されていればFAILにします。
実行後DOMでは既存の商品等validatorと原本の保護領域を照合します。Releaseの名義/CVは、
caseに対応付けたSinger応答の原本hash、JSONP callback、ID/category/正式名/member key/castを
独立照合した場合だけ許容します。live DOMを削除・改変して静的validatorへ渡しません。
SongにはSong v46 selectorを使い、Release用のCV処理やselectorを適用しません。
文書種別は必須の`documentType: "fixture" | "formal"`、通信条件は`mode`で別々に指定します。
localhost上の合成fixtureも`documentType: "fixture"`です。必須の`canonicalOrigin`は
アクセス先originから補完せず、合成fixtureには明示した`.invalid` origin、正式HTMLには
承認SHAのmanifestに記録された公開HTTPS originを使います。
保護対象は本文mainContent、heroMeta、Release section nav、Song infoとタイトル/SEOです。
これ以外のページ全体や全ブラウザ挙動を、この文書比較だけで保証するものではありません。

### 実行順とSTOP条件

1. 実行前にNode、対象checkoutの`tests/node_modules`、Playwright実体/lock、Chrome実体を読み取り確認します。
   `tests/node_modules`は通常のディレクトリでも利用でき、junctionは必須ではありません。
   junctionを使う場合は接続先も確認します。拒否・欠落・不整合なら環境不足としてSTOPし、
   無断のinstall・依存更新、junction付替え、別依存へのfallbackは行いません。
   純粋検査も正式validatorのimport経由でPlaywrightを必要とするため、この依存確認を先に行います。
2. `node --test tests/detail-qa-contract.test.cjs`で純粋検査と負例（既存62件）を確認します。
   この検査ではブラウザを起動しません。末尾のreplay統合ケースには、後述のGit事前条件も適用されます。
   Codexのネットワーク制限も確認します。既知のlocalhost拒否が続く環境で無条件retryせず、
   環境による未実施として残します。権限・sandbox・Firewallを変更してはいけません。
3. 利用可能な場合だけ、次のlocalhost fixture QAを実行します。公開APIには接続しません。

```powershell
$env:DETAIL_QA_EVIDENCE_DIR = 'C:\approved-new-evidence-parent'
$env:DETAIL_QA_SOURCE_RUN = 'unique-detail-local-run'
node --test tests/detail-qa-browser.test.cjs
```

evidence parentは事前に承認した既存絶対パスで、checkout外である必要があります。
sourceRunのディレクトリが存在すればEEXISTで停止します。ブラウザ検査はPC1280/スマホ390、
Release/Songの4条件です。未実施、環境不足、FAILをSKIPや全体PASSに変換しません。
Chrome channelを明示し、依存やブラウザの自動取得はしません。

4. オフライン関連回帰は、副作用を確認した次のファイルを個別に明示指定します。

```powershell
node --test tests/web-smoke.test.cjs
node --test tests/static-html-validator.test.cjs
node --test tests/release-body-validator.test.cjs
```

   `release-capture-preparation.test.cjs`はHTTP・一時CSS書込みを含むため、この許可リストに含めません。
   `test-name-pattern`を安全境界にせず、glob・自動探索・旧runnerを使いません。
   ファイルのトップレベル処理・hook・import先、`NODE_OPTIONS`等の実行条件を事前確認します。
   baseline必須の歴史的テストを含む全件実行はしません。assert/期待値/timeoutを緩和しません。

各テスト実行は別のsourceRunと生ログで記録してください。負例、ブラウザ、既存回帰、過去PASSは
別集計です。新規FAIL時は証拠を保存してSTOPし、原因不明のretryは行いません。

### 捕捉済み文書の再検査入口

```powershell
node tools/run-detail-qa.cjs --plan C:\approved\plan.json --source-run unique-replay --evidence-dir C:\approved-evidence
```

これは`operation: "replay"`専用です。HTTP取得、ブラウザ起動、生成、Git変更、公開を行いません。
成功時は`CONTRACT_PASS`/`browser: "NOT_RUN"`であり、全体QA PASSや現在のPROD配信確認とは別です。
Git HEADとローカル追跡参照`origin/main`が承認`expectedHead`と一致する条件は、このreplayの事前条件です。
任意の開発作業や全テストに共通する条件ではありません。ただし純粋検査62件に含まれるreplay統合ケースは
実checkoutを使うため、同じ一致条件とstagedなしの条件を満たす必要があります。不一致なら実行前にSTOPし、
検査を通す目的でGit状態・追跡参照・assertを変更しません。
既存E2E helperやquery形式のページ呼出し元は一括変更していません。正式な`/release/Rxxxx.html`、
`/song/Sxxx.html`を対象とする明示契約です。query/API描画専用のページは別契約が必要です。

plan JSONの必須項目は次のとおりです。省略値を旧04AのSHA、原本、環境変数で補完しません。

| 項目 | 内容 |
| --- | --- |
| `schemaVersion`, `operation` | `1`, `"replay"` |
| `targetRoot` | この共通処理が属するcheckoutの絶対パス。別checkoutのvalidatorとの混在は禁止 |
| `expectedHead`, `expectedBranch` | 承認された40桁SHAとbranch。ローカルorigin/mainも同SHAであること |
| `outputRevision`, `dataRevision` | 明示的な`sha256-...`。currentのrevision aliasもoutputRevisionと一致 |
| `mode`, `origin`, `mocked` | 下表のnetwork契約 |
| `documentType` | 必須の`"fixture"`または`"formal"`。通信modeから推定しない |
| `canonicalOrigin` | fixtureだけに必須の明示`.invalid` origin。formalのplanでは指定禁止。承認`expectedHead`のSong/Release manifestから取得する |
| `allowedChanges` | Git順の承認済み差分全件。各行`{path,status,sha256}`。statusは`" M"`または`"??"`。staged/rename/deleteは拒否 |
| `inputs` | 全入力`{key,path,sha256}`。絶対パスの原本/runtime HTML/snapshot JSON/任意のAPI evidence JSON。hashは独立確認する |
| `cases` | `{caseId,kind,id,rawInput,runtimeInput,dataInput,apiInput?,http}`。Inputはinputsのkey。caseIdは一意 |
| `http` | `{mode,status:200,redirected:false,url}`。originと正式なkind/IDのURLに一致 |

| mode | 通信条件（documentTypeとは別） |
| --- | --- |
| `fixture` | `.invalid`のオフライン合成origin、`mocked:true` |
| `localhost` | HTTP loopback、`mocked:true`。合成fixtureも正式HTMLも、別のdocumentTypeとして指定可能 |
| `prod` | 公開HTTPS、`mocked:false`。replayは実配信確認の代用ではない |

| documentType | 文書の検査契約 |
| --- | --- |
| `fixture` | 明示した合成dataと独立した`expected.fields`/`expected.relations`を照合。canonicalは明示した`.invalid` origin。正式HTML validatorのPASSとは区別する |
| `formal` | 原本HTML/snapshotが対象checkoutとbytes一致し、完全な正式validatorもPASSであること。canonicalは承認SHAのmanifestから取得し、Revision・page path・公開URLを厳密照合。planの任意値で上書きできない |

fixtureの`expected.fields`は`{elementId: "期待テキスト"}`、`expected.relations`は
`[[relationId, "song/Sxxx.html"], ...]`です。期待値をruntime DOMから生成してはいけません。
formalのSong静的本文は既存の完全な正式validatorで確認し、その検証済みHTML原本からの
runtime本文差分を厳密比較します。Song本文validatorを新たに緩く複製しません。
Releaseは既存のalbum/single/Blu-ray/contents/vocals/navigation/sidecar validatorを再利用します。

Windowsのcheckout時の改行変換（LFからCRLF等）でも、正式HTMLのbytes/hashはmanifestや承認原本と
不一致になり得ます。正式HTMLを使う検査の前に、対象checkoutの改行状態と原本bytes/hashを確認してください。
不一致ならSTOPし、Git設定の無断変更、再生成、HTML・manifestの手修正で検査を通してはいけません。

API evidence JSONは`{mode,caseId,mocked,requestUrl,url,redirectChain,status,body,sha256}`です。
PRODではGoogle scriptのHTTPS応答chainとsingerList actionを確認し、fixture応答を受け付けません。
API原本を認めることは、公式一次資料の真実性を保証するものではありません。

証拠はsourceRun専用の新規ディレクトリへ保存します。各ファイルは`wx`、進捗は連番の別ファイルで、
既存のHTTP原本・DOM・結果を上書きしません。製品/入力ディレクトリ内への出力は拒否します。
formalでは期待canonicalの根拠となる承認SHA・manifest path/hash・期待URLもcase別に保存します。
過去planに必須項目がない場合は、承認された新しいplanへ明示して移行します。旧証拠は編集しません。
結果にはPRODUCT/HARNESS/COMMUNICATION/ENVIRONMENT/UNCLASSIFIEDを記録します。
assertの例外だけで製品不具合と断定せず、通信障害をPRODのSKIPへ変換しません。
`net::ERR_ABORTED`の別記録は明示的なnavigation phaseだけです。

旧04A RECOVERY、03D lib、PUBLISH/旧FAIL、固定SHAへの暗黙依存はありません。
旧137 HTTP/24条件のrunner、Pages照合、公開・集計はこの共通処理の対象外です。
