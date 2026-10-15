# UI・リンク操作の共通仕様と全ページ展開計画

監査日：2026-10-15。UI-LINK-CONSISTENCY-01 改訂版。

現在の状態：棚卸し・仕様設計に続き、ユーザー承認を受けてHome最近の曲・新規ブランクランキング・Venue最初/最後の3領域だけ試験適用。Song収録Releaseは次工程へ保留（恒久例外ではない）。未公開・未commitです。初回監査でのSTOP経緯と未展開箇所は以下に記録します。

FEATURE-GAP-RANKINGS-01/02の未commit成果物は保持。データ・集計・API・snapshot・正式HTML・manifest・current・rendererは変更していません。

## 1. 監査方法と限界

- 実ソースのHTMLテンプレート、DOM生成JS、ページ内CSS、共通style.css/common.jsを照合。
- Windows / Chrome headless / PC1280×900で公開ページのローカル実装を起動し、主要リンクの実DOM・href・computed color/下線/padding、包含カードのリンク/ボタン数を取得。
- Home、正式Song S017、Venue VE0038、新規gap-rankingsは390×900でも通常・hover・キーボードfocus・実クリック範囲を確認。
- Member Analyticsは最初のselectorが存在しない/desktop DOMがmobileでは非表示のためtimeout。実際のdesktop表とmobile専用見出しのselectorへ修正し、両方の曲リンクを再確認済み。製品不具合や試験PASSの根拠にはしない。
- 表のリンク数は代表カードの実測であり、ページ全体の全データ行が同じリンク数という意味ではない。条件付きリンクはJSの生成分岐も確認。
- 実機iPhone/Safari、OSの右クリックメニュー「新しいタブ」、全ページ全カードのhover/focusは未検証。実測とコード上の仕様を区別する。
- これは現状監査。変更後UIの試験・表示承認・PROD QAではない。

色：濃紺=`#172033`、アクセント=`#4F46E5`、Member Analytics青=`#2B65B1`。下線なしの同色リンクでもクリック面積は異なる。

## 2. 全体棚卸し

「全文」はカード外枠自体がa、「文字」はカード内のタイトル/補足a。「矢印」は常時表示する右向きアイコン（代表要素を確認）。クリック可能と見せるhoverはリンク要素に限定する。

| ページ・代表領域 | DOM/コンポーネント・遷移先 | 通常色/下線/矢印 | 操作範囲・遷移先数 | hover/focus・タッチ上の現状 | 現在→統一型 |
| --- | --- | --- | --- | --- | --- |
| Home 最近歌われた曲 | home-v453.js `article.recent-song`、Song/singer | 曲/歌唱者は紫、下線なし、曲矢印なし | 文字2リンク。外枠は非リンク | 曲文字約19px高、hover下線、focus3px輪郭/下線。色が密集 | B→B＋主要/補足分離 |
| Home 最近イベント | `a.recent-event`＋会場a、日時/種別span | イベント紫・下線なし・chevron | イベント見出し、会場は別リンク | イベントhover/focusで下線。spanの分類は非リンク | B＋C＋E |
| Home 探索/ランキング/今日は何の日 | index.html/home-v453.js各card/row、Event/Release/Song | 領域別の装飾、単一cardと補足aが併存 | 展開イベントにはbutton＋複数Songリンク | 曲を見る/閉じるはbutton。単一リンクカードと展開カードを分ける必要 | A/B/C/D/E |
| 楽曲一覧 | songs-v470.js `a.song-list-card`、Song | 濃紺・下線なし・代表card矢印なし | 全文、1リンク | padding17px、hover枠/背景。フィルターはbutton/checkbox | A＋D |
| 楽曲詳細 収録リリース | song-v441.js `article.song-included-release-card > ... > a.song-included-release-link`、Release | 濃紺・下線なし・chevron | タイトルだけ1リンク。日付/Relation/外枠は非リンク | PC約31px/mobile約21px高、hover下線のみ。focus輪郭、タイトル色不変 | 単一リンクなのでAへ構造変更 |
| 楽曲詳細 歌唱履歴 | `article.song-row`内Event a＋singer a | Event濃紺＋chevron、補足はページCSS | 文字2リンク（名義IDなしは1） | 外枠は非リンク。単一aカードの参考として流用しない | B＋C |
| 楽曲詳細 関連曲等 | song-v441.js、Song/公式/関連Release | 部分ごとのcard/文字aが混在 | 1リンクと複数リンクを個別分類 | Solo Live!シリーズ見出しはh3、aなし | A/B/C/E |
| イベント一覧 | events-v470.js `a.history-event-card`、Event | 濃紺・下線なし・代表矢印なし | 全文、1リンク | padding17px18px、hover枠/背景 | A＋D |
| イベント詳細 歌唱曲 | event-v310.js `div.event-song-row`内Song/singer | 主題濃紺・下線なし・右アイコン | 文字2リンク。外枠非リンク | 名義IDがある時のみ名義a。セットリスト操作は別button/select | B＋C＋D |
| リリース一覧 | releases-v500.js `a.release-list-card`と補足Song a | 主題濃紺・下線なし・chevron | 通常A。22対象のentryはRelease card＋SongリンクのB | 補足を包含aに入れない。padding19px20px | A/B＋C＋D |
| リリース詳細 | release-v500.js `a.release-included-song-row`/event/child rows | 濃紺・下線なし・chevron | 全文、1リンク/row | padding14px16px。Discのdetails/summaryと独立 | A＋C＋D/E |
| R0072 神パラ | release-kamipara.js、収録曲・履歴・年filter | 文字リンク＋履歴/補足 | 複数リンク・操作混在 | DOM保持/会場補完/開閉契約を壊せない | B/C/D/E |
| 会場一覧 | venues-v470.js `a.venue-list-card`、Venue | 濃紺・下線なし・代表矢印なし | 全文、1リンク | padding18px、hover枠/背景 | A＋D |
| 会場詳細 最初/最後 | venue-v300.js `a.insight-row`、Event | 濃紺・下線なし・chevron | 全文、1リンク | PC約78.8px/mobile約105.2px高。hover枠/背景、focus3px輪郭。余白からもEvent | Aの基準候補 |
| 会場詳細 その他 | insight-row/event/song/singer rows、各詳細 | 濃紺/アクセント、row別 | 全文aと補足リンク | 数値情報には独立リンクがない場合あり | A/C/E |
| 歌唱名義一覧 | singers-v470.js `a.singer-list-card`、Singer | 濃紺・下線なし・代表矢印なし | 全文、1リンク | padding18px、hover枠/背景。スコープbutton | A＋D |
| 歌唱名義詳細 | singer-v460.js `article.singer-event-card`、Event/Song | Event濃紺・下線なし・代表矢印なし | 代表2リンク＋1button。開くと曲数に応じ増加 | 曲を見るbutton、aria-expanded/controls。年別グラフは情報/切替 | B/C/D/E |
| 既存ランキング | rankings-v421.js `a.ranking-row`/podium | 濃紺・下線なし・代表矢印なし | 全文、1リンク | padding15px18px、hover枠/背景。ランキング指標button | A＋D/E |
| 統計 | statistics-v470.js `a.stats-rank-row`、概要a/article | 濃紺・下線なし・代表矢印なし | rankは全文1リンク。概要はaかarticleに分岐 | padding9px10px。非リンク概要とリンク概要の差が弱い | A/D/E |
| いつ振りチェッカー | gap-checker-v490.js、gap-song/event links、履歴toggle | Song紫・下線なし、Event濃紺・通常下線なし | 入力cardは非リンク、button操作。結果は複数a | Eventはhoverで下線、button/入力focusあり | B/C/D/E |
| 新規ブランクランキング | gap-rankings.js `li.gap-rankings-row` | Song紫・下線なし・矢印なし。Event濃紺＋薄い下線 | A代表3リンク、BはEventが増える。外枠非リンク | Song高PC25px/mobile22px、hover下線なし。focus3px輪郭 | B＋C＋機能リンク |
| 検索結果 | search.html `a.result-row`、各詳細 | 濃紺・下線なし・chevron | 全文、1リンク | padding15px18px。分類/順位は変更せずrole付与 | A＋D |
| 共通検索/ナビ/フッター | common.js、結果a、nav a、menu button | 共通CSSのcomponent別。全aへ一律適用しない | 結果は単一a、navigationは個別a、menuはbutton | active/aria-expanded・候補操作を維持。navはcardではない | 検索A、nav専用規則、C/D |
| Member Analytics | member-analytics.js / css、表内曲a/mobile見出しa | 濃紺・下線なし、hover青＋下線 | 文字a。表/集計cardは非リンク | desktop/mobile DOM別。曲リンクとfilterのlabel/inputを混同しない | B/C/D/E |
| 神パラ専用ページ | kamipara-v100.js `details.kp-card.kp-event`等 | info/card・details/リンクが併存 | 代表detailsはa0、summary開閉。曲名/履歴を個別判定 | detailsを全面リンクに置換しない | B/C/D/E |
| About / 404 | about.js/about.html、404.html | About概要は非リンク、参照/戻るa | 概要E、参照C、機能への戻るaction | 404はソース確認、ブラウザ実測対象外 | C/E＋機能リンク |

## 3. 共通仕様（実装時の契約）

### TYPE A：単一遷移先カード

- 外枠そのものをネイティブaにする。内部a/button/input/select/summaryは禁止。onclickで疑似リンク化しない。
- 主要タイトルは濃紺・太字、青いchevron-rightを常時表示。通常下線なし。
- hover/focus-visibleではタイトルを青＋下線、枠/背景も変化。focusは3pxの明瞭な輪郭。
- タイトル・日付・数値・余白が同じhrefを指す。リンク先は既存URLのまま。
- 中クリック、Ctrl/Command+click、ブラウザの新しいタブをネイティブaとして保持。
- a内部の補足情報はspan/div。単一遷移先の補足情報を別aへ重複リンク化しない。

### TYPE B：複数遷移先カード

- 外枠はarticle/li/div。onclick、data-hrefや不可視の全面aは設けない。
- 主要タイトルリンクは濃紺・太字＋常時chevron。補足は青＋通常下線。
- 押せるタイトル領域は内側paddingとmin-heightで拡張し、mobileの主要リンクは原則44px以上の高さを確保。タイトル領域だけを明確に拡張し、隣接a/buttonに被せない。
- 非リンク余白は遷移しない。複数リンクを持つカード全体にpointer/リンク風hoverを付けない。
- Event/Song/Singer等の行き先を明示し、長い文字はmin-width:0/自然折返し。ellipsisやoverflowで隠さない。

### TYPE C / 機能リンク / TYPE D / TYPE E

- 補足テキストCは青＋下線、矢印なし。歌唱者、参照、関連情報。
- 機能誘導は青＋arrow-right。chevron（詳細への移動）と意味を分ける。
- 操作Dはbutton。選択はaria-pressed、展開はaria-expanded/controls。summary/select/checkboxは本来のネイティブ操作要素を維持し、不必要にbuttonへ置換しない。
- 情報Eは濃紺/グレー。a風のcursor、矢印、hover枠変化は不要。グラフ・ランキング日数のアクセントは許可。
- ナビゲーションは既存active/メニュー構造を維持する専用component。各nav aに無差別にcardのchevronを足さない。外部リンクは既存external-link/target/relを維持。

## 4. 再利用クラス案とCSS管理

既存のmus-* namespaceを使う。初回棚卸しでは同名クラスの使用なし。再開後の3領域試験で主要/補足/機能リンク・全面/複数リンクカード・scopeを適用済み。情報カード用mus-card-infoは将来展開案であり、まだ追加していません。

| 役割 | クラス案 | 適用要素 |
| --- | --- | --- |
| 主要タイトル | mus-link-primary | a。内部にタイトルspanとaria-hiddenのchevron |
| 補足リンク | mus-link-secondary | a |
| 機能リンク | mus-link-action | a。arrow-right |
| 全面リンクカード | mus-card-link | 外枠a。titleはmus-card-title |
| 複数リンクカード | mus-card-multi | article/li/div |
| 情報カード | mus-card-info | 非インタラクティブ要素 |
| 適用scope | mus-link-scope | 段階適用するsection/container |

共通ファイル候補は`assets/css/link-ui.css?v=1`。最初からstyle.cssや全aを無差別変更しない。試験4領域にscopeを付けて読み込む。`mus-link-scope .mus-link-primary`等の役割selectorを用い、既存個別selectorとのspecificityを照合する。必要な旧装飾だけ取り除き、!important競争で隠さない。

例外の記録がない限り、同じ役割classには同じクリック範囲/hover/focusを持たせる。「見た目が同じ・範囲だけ違う」をテストで拒否する。

## 5. 代表4箇所の実装計画と初回STOP理由

| 箇所 | 必要な変更 | 維持する操作 | 正式生成への影響 |
| --- | --- | --- | --- |
| A 新規ブランクランキング | liをBのまま、Song primary＋chevron、Event secondary、checker action。CSS高優先度の現行装飾を役割へ整理 | 数値/集計、3区分、URL、複数リンク分離、外枠非リンク | 新規ページのHTML/JS/CSS/testのみ。現行fingerprint対象外 |
| B Home 最近歌われた曲 | Event/Song primary、Singer/会場secondary。44px主要link領域を確保 | articleはB。Singer/曲の別href、moreを維持 | index.html/home-v453.js/CSS/test。現行Song/Release fingerprint対象外 |
| C Song 収録リリース | **article外枠を単一aに変更し、内部タイトルaはspanへ**。日付/Relation/盤情報を保持。Solo Live! h3はE | 1作品1href、余白クリック/中クリック、Relation表示。将来リンク追加時はBへ分岐 | **song-v441.jsとsong.htmlはrenderer依存。正式Song117の再capture・manifest/provenance同期が必要** |
| D Venue 最初/最後 | 既存a.insight-rowにA role。title hover/focusの青＋下線を追加 | 全文クリック、Event URL、日時/区分。中クリック維持 | venue.html/venue-v300.js/CSS/test。現行Song/Release fingerprint対象外 |

Cは実JSで`renderCard`がarticleを生成し、Relation行はspan/div、featuredSingerはテキスト。現在は追加リンク/buttonがなく、1カード1遷移先。CSSだけでは外枠articleをaにできない。タイトルpaddingだけ広げてもTYPE Aの全体クリックにはならず、統一完了とは言えない。

正式S017 HTMLにも同じarticle構造が保存されている。JSだけ修正して静的本文を旧構造のまま残すと、初期/JS OFFとruntime更新後でクリック範囲が変わるため禁止。

現行Song fingerprintはcapture-provenance helperを含む13ファイル、Releaseは同helperを含む12ファイル。song-v441.js/song.htmlはSong依存。共通common.js/icons.jsを変更すると両依存に影響し、Song117＋Release114の同期が必要となる。

外部CSS自体はfingerprint対象外だが、CSS参照をsong.htmlに追加/バージョン更新することはtemplate変更でありSong fingerprintが変わる。既存style.cssのqueryはSong4.4.1、Release4.7.0、Home4.6.2、Venue4.6.0と異なる。新CSS参照を代表ページだけへ追加する方針ならRelease114の更新は不要。共通CSSバージョンを全template一括変更する方式なら両全件同期が必要。

**初回のSTOP**：代表4箇所の実装前に、Cと共通CSS読込の正式Song117更新が必要と確定。その時点でUIコード/CSS/テンプレート変更は行わなかった。再開後はCを保留し、9章の3領域だけを実装。無断の再生成は実行していない。

## 6. 全ページ展開計画

共通CSS作成だけを完了扱いにせず、各ページのmarkup役割・既存CSS・クリック範囲をセットで移行する。今回の代表3領域の表示承認後、保留したCの正式同期を別途承認したうえで、独立した範囲単位で展開する。

| 優先 | 範囲・統一後 | 主な修正対象 | 難易度 | 依存/正式同期 |
| --- | --- | --- | --- | --- |
| 1 | 代表4箇所 A/B/C/D/E | gap-rankings.html/js、index.html/home-v453.js、song.html/song-v441.js、venue.html/venue-v300.js、共通link-ui.css、関連tests | 中 | Song117同期の承認必須 |
| 2 | 曲/Event/Venue/Singer一覧 A＋D | songs/events/venues/singers.html、各一覧JS | 低〜中 | 役割CSS/既存icons。通常は個別prerender依存外 |
| 2 | Release一覧 A/B＋C | releases.html/releases-v500.js | 中 | 22対象のSong補足を外枠aに入れない。遅延/3同時/通信共有回帰 |
| 2 | Event/Singer/Venue詳細 B/C/D＋一部A | event/singer/venue.html、各詳細JS | 中 | 年/開閉/名義・Songリンク保持。該当template/JSは現在Song/Release依存外 |
| 3 | Song他領域 B/C＋一部A | song.html/song-v441.js/singer-links.js | 高 | Song117同期。singer-linksは共通利用にも注意 |
| 3 | Release詳細 A/C/D/E・神パラB | release.html/release-v500.js/release-kamipara.js | 高 | Release114同期、R0072 DOM/venue保持・Amazon/Disc開閉回帰 |
| 3 | 既存ランキング/統計 A/D/E | rankings/statistics.html、各JS | 中 | 概要articleとaの区別、Chart/段階描画を維持 |
| 3 | gap checker B/C/D/E | gap-checker.html/gap-checker-v490.js | 中 | 計算/共有/履歴/ARIA/イベント対応は変更しない |
| 3 | Member Analytics B/C/D/E | member-analytics.html/js/css | 中 | Desktop/Mobile両DOM、18モバイル条件、集計不変 |
| 3 | 神パラ専用ページ B/C/D/E | kamipara.html/kamipara-v100.js | 中 | summary/details/リンクの分離、データ不変 |
| 4 | 検索結果 A＋共通検索A | search.html/common.js | 高 | common.js変更でSong117＋Release114同期。search最新応答guard維持 |
| 4 | 共通ナビ/フッター、About/404 | common.js、about.html/about.js/404.html | 中〜高 | nav専用状態、外部リンク、共通依存の両全件同期 |

## 7. 実装承認後の必須回帰

PC1280/mobile390、通常/hover/focus-visible/キーボード。主要リンク44px、長文折返し、境界矩形の非重複、document/個別カード横overflow、a入れ子0。

- A：余白・タイトル・日付から同一href。中クリック/new tabで正しいURL、Enterで遷移。内部button/a0。
- B：Song/Event/Singer/checkerの個別href。外枠余白ではURL不変。不可視overlayなし。各リンクの中クリックも独立。
- C：通常下線、矢印なし。D：button/select/summary/inputの適切なARIA/操作。E：href/pointer/リンクhoverなし。
- 正式Song HTMLのJS OFF/初期/更新後が同じ操作型。Solo Live!見出しは非クリック。
- snapshot/data/Relation/集計・SEO/canonical/OGP/JSON-LDを維持。生成したmanifest/hash/bytes/fingerprint/provenanceを独立validatorで検証。
- Home最近/今日は何の日、Song Releaseリンク、Venueリンク、検索・共通nav、gap rankingsの既存回帰。既存QA画像の無断上書き禁止。

## 8. 初回監査の確認結果（試験適用前）

- 代表4箇所PC/mobileの現状hover/focusを実測。通常色/高低差は棚卸し表に記載。代表4領域のpage error 0、横overflowなし（現状の確認であって変更後PASSではない）。
- 会場カードの角丸外ではなく、内部余白12px・縦中央でhit-testを実施。両幅で`event.html?id=EV0062`を検出。PC中クリックでも同Eventを新タブに開いた。
- 全体代表DOM調査でa入れ子は検出なし。全データ・全展開状態の網羅保証ではない。
- 新規ランキング集計/例えの既存32件＋Web smoke6件＝38/38 PASS。今回UI未変更のため前STEPの画面PASSを変更後試験として流用しない。
- 独立validator：PASS / integrity PASS / provenance VERIFIED / reusable true。Song117・Release114維持。
- diff --check PASS。実装・正式生成・commit・push・deployなし。本STEPの追加はこの仕様Markdownのみ。

現状画像（変更前・focus状態を含む）：一時領域 `musdb-link-hit-audit-IppzNe` のHome/Song/Venue/Gap ×1280/390。既存QA画像は上書きなし。

再開には、(1)正式Song117再capture・manifest/provenance同期を含めて4箇所適用する承認、または(2)Cを明示的に保留して残り3箇所のみ試験適用する範囲変更の指示が必要。

## 9. 再開後の3領域試験適用

ユーザーは(2)を承認。今回Song収録Releaseへのmarkup/CSS/runtime適用は一切行っていません。後続工程では外枠aへの構造変更→正式Song117再capture→manifest/provenance同期→独立検証を行う必要があります。この保留は恒久的なTYPE A例外ではありません。

### 適用範囲

| 領域 | 実装 | クリック契約 |
| --- | --- | --- |
| ブランクランキング | mainをrole scope、liをmus-card-multi。Song primary、Event secondary、checker action。日数/例え/集計不変 | 個別aだけ遷移。余白は遷移なし |
| Home最近の曲 | recent-cardのみrole scope。Event/Song primary、Singer/会場secondary。主要aは44px以上、非リンク分類spanは非リンクのまま | Song/Singer/Event/Venueのhrefと操作を分離 |
| Venue最初/最後 | venueHistoryEventsだけrole scope。既存a.insight-rowをmus-card-link、タイトルをmus-card-title | 全面aと既存Event hrefを維持 |

共通`assets/css/link-ui.css?v=1`は3ページだけで読込み、role scope内の明示classだけを対象にします。style.css・common.js・icons.js・Song/Release templateは変更していません。個別inline CSSよりrole selectorが優先されることをcomputed CSSで確認しました。!important・全a一括指定・不可視overlay・a入れ子は使っていません。

主要aは通常濃紺/太字・青chevron、hover/focusは青＋下線と3px focus輪郭。補足は通常から青＋下線。機能誘導は青＋arrow-right。TYPE Bの隣接aはbounding rectの重なりを拒否し、44px拡張はタイトル自身の領域に限定。TYPE Aは外枠aの既存grid/paddingを維持します。

キャッシュ参照：Home JS4.9.5、Venue JS4.9.2、新規ランキングJS v3、role CSS v1。既存共通CSSや他ページの参照は更新していません。

### 検証と成果物保護

- 標準`npm --prefix tests run test:ui-links`に6件登録。3領域×PC1280/mobile390で通常/hover/focus、44px主要a、非重複、余白操作、中クリック・Ctrlクリックの新タブ、Enter、長文折返しを検証。mobileはChromeのtouch emulationによるtapも検証。実機iPhone/Safari・OSコンテキストメニューは未検証。
- 新タブの行き先とTYPE B外枠のURL不変を検証。Venueは内部余白を実際にクリックして正しいEventへ遷移し、戻ってからキーボードも確認。
- 制御mockは正式renderer/CSSで描画し、遷移先documentだけ隔離fixtureに置換。実API/正式派生データを用いたローカル実画面確認も別に実施し、3領域×2幅でpage/console error 0・横overflowなし。
- 新規操作回帰6件を含むHome/Today/Release/nav/主要17ページ/導線/Web smoke回帰61/61 PASS。別途ランキング40/40 PASS（全6条件の修正前結果一致を含む）。
- 独立validator PASS / integrity PASS / provenance VERIFIED / reusable true。正式Song117/Release114維持。
- Song/Release HTML・manifest、全既存snapshot、current、派生JSON、集計model、Song renderer/template、Release template、共通CSS/JS/iconsを含む保護対象5,655ファイルの集合hashは実装前後で一致。
- 再capture・正式生成・manifest同期・Revision変更・commit・push・deployは実施していません。

実データ変更後画面は新規一時領域`musdb-ui-links-real-yxEES5`のhome/gap/venue ×1280/390。制御回帰の通常/focus画像は別の`musdb-ui-links-*`一時領域へ保存。既存QA画像を上書きしていません。

残りは本書6章の展開計画に従い、ユーザーの表示承認後に別工程で実施します。今回3領域の適用を全サイト統一完了とは扱いません。

今回変更した11ファイル：`assets/css/link-ui.css`、`assets/js/gap-rankings.js`、`gap-rankings.html`、`assets/js/home-v453.js`、`index.html`、`assets/js/venue-v300.js`、`venue.html`、`tests/ui-link-consistency.test.cjs`、`tests/package.json`、`tests/active-entrypoints.json`、`docs/ui-link-consistency.md`。前STEPの未commit成果物はそのまま保持。

最終Git状態：modified7 / untracked12 / staged0。HEAD/main/origin/mainはいずれも`677cf02616392d72f888c246a749e352428d5391`。diff --check PASS。今回範囲でSTOP事項なし。Song収録Releaseおよび全サイト展開は未完了。

## 10. UI-LINK-CONSISTENCY-02：TYPE B主要リンクの新候補

今回の適用は歌唱ブランクランキングだけ。承認済みHome/Venue、共通link-ui.css、共通icons/style/JSを変更していません。

### 候補仕様と実装

- TYPE Aは外枠a・濃紺タイトル・青chevron・hover/focus反応を維持。
- TYPE Bは外枠非リンク。主要タイトルは濃紺/太字、右側に30×30px・角丸8px・ごく薄紫`#f2efff`背景のindigo chevron。タイトルと矢印は同一a。補足は青＋下線、機能誘導は青＋arrow-right。
- ランキング限定selectorで既存roleを拡張。aはinline-flex/align-items:center、labelはmin-width:0/自然折返し、chevronはflex-shrinkなし。背景枠もinline-flexでSVGを中央に置き、内部SVGを16×16pxへ固定。固定top・負のmarginは使っていません。
- 前の16px icon hostに対してfont-size由来の1em SVGが大きくなる構造が位置ずれ要因。新しい30px host内でSVGと文字の矩形中央を比較して位置合わせを確認。
- hover/focus-visible時はchevron枠だけtranslateX(3px)、transformのtransitionは0.18s ease。aやカードは移動せず、primaryの右paddingに移動分の余裕を確保。reduced-motionでは移動とtransitionを止め、focus輪郭は残す。
- 日付ラベル・値は濃紺/800、Event補足リンクは700、14pxで自然折返し。Eventには背景付き矢印を付けない。

### DOM順とチェッカー導線

カードDOMは順位→曲名→日数ブロック（数値→説明→既存例え→checker a）→歌唱日/Eventブロック。checkerをCSS orderで動かすのではなく、JSの生成markupで日数ブロックへ移しました。

mobileではこのDOM順がそのまま縦配置。PCでは既存gridで曲名/日付/Eventを左、日数/例え/checkerを右へ配置。読み上げ・Tab順は共通でSong→checker→Event。例えが非表示の短期間でもcheckerは日数説明の後に置きます。href・集計・例え文は変更なし。

### 恒久回帰と実測

- 新規6件を既存標準`test:gap-rankings`に追加（ファイルが同じためscript追加不要）。A/B×1280/390の上位3件、計12カードでhover前後のbounding rectとcomputed transformを比較。
- 全12件で移動量3px、transform `matrix(1, 0, 0, 1, 3, 0)`。カードとaの矩形は変化なし。SVG/背景枠/曲名の中央差は1px未満。44px以上の主要リンク領域、同一a・hit-test、長い曲名/Eventの複数行・横overflowなしを確認。
- focus-visibleでも同じtransformと明確なoutline。1280/390のreduced-motion試験はtransform none/transition 0sを確認。
- checkerは例えの直後のDOM sibling。最初の2つのTab対象はSong→checker。mobileではcheckerの下に日付/Eventを配置。PCではchecker矩形が右側日数ブロック内に収まる。
- ランキング46/46、3領域操作回帰6/6、Web smoke6/6 PASS。全6区分/種類のランキング結果は前STEP基準hashと一致。独立validator PASS / integrity PASS / provenance VERIFIED / reusable true。
- 既存主要17ページと主要導線も19/19 PASS、skip 0。上記との合計77/77 PASS。通常表示page/console error 0・横overflowなし。diff --check PASS。
- 正式データ/生成物、model、例えhelper、current、Home/Venue、共通CSS/JS/icons等を含む5,662保護ファイルの集合hashは実装前後で一致。
- 画面は正式派生JSONを使い、API共通Revision応答のみ制御したlocalhost/Chrome。画像は`musdb-gap-rankings-hDTptA/chip-current-1280.png`等の新規一時領域。実機iPhone/Safariは未検証。既存QA画像は上書きなし。

今回変更は`gap-rankings.html`のランキング限定CSS/JS参照v4、`assets/js/gap-rankings.js`の表示markup、`tests/gap-rankings-ui.test.cjs`、この仕様書の4ファイルのみ。

新候補をHome/Venueや他ページに自動展開しない。Song詳細・Venue詳細等の既存chevron位置ずれは後続の共通UI改善でhost/SVG/line boxを実測し、個別offsetではなく役割に沿ったflex配置へ直す。Song収録ReleaseのTYPE A構造変更・正式同期は引き続き別承認工程。

commit/push/deploy・再capture・Revision更新は実施していません。ユーザーの表示承認待ち。

02の最終Git状態：前STEP込みmodified7 / untracked12 / staged0、HEAD＝main＝origin/main＝`677cf02616392d72f888c246a749e352428d5391`。今回のSTOP事項なし。

## 11. 一括公開の準備記録

FEATURE-GAP-RANKINGS-PROD-01では表示承認済みの4STEPをまとめて公開する。Homeの既存ツールカードに新ランキングへの導線を1件追加し、正式sitemap generatorの固定ページへ登録。sitemapは242 URL（Song117・Release114・固定11）となる。共通ナビJSは変更しないため、正式Song/Releaseの再生成は不要。

導線追加に伴いHomeの主要Lucideアイコンは9件、Aboutは従来8件。件数と寸法検証配列をそれぞれ固定件数で照合し、24px/線幅2px/decorative/キーボード/重複描画なしの検証は維持する。最終関連回帰89/89 PASS（skip 0）。画像は都度新規一時ディレクトリに保存する。

実装仕様書に残る「未公開」「承認待ち」「Git状態」は各ローカルSTEP時点の履歴である。実際の公開状態は対応commitとGitHub Pages buildの結果を別途確認する。

保留：Song収録ReleaseのTYPE A構造変更・正式117再capture/manifest/provenance同期。Venueの不要セクション整理、年別フィルター統一、「曲を見る」追加も本公開には含めず、別工程で扱う。

## 12. UI-LINK-CONSISTENCY-03：正式基準とHomeローカル展開

01/02とランキング折返し修正は公開済み（基準commit `d697f16273326362a82fd4f5ec55b3b6b6c3c2f1`）。今回03はローカル表示承認待ち。既存の公開状態と各章の過去記録を区別する。

正式基準は濃紺 `#172033` の太字タイトル＋indigoの16px SVGを中央配置した30px角・角丸8px・薄紫 `#f2efff` chevron。hover/focusでは背景枠だけ3px移動、0.18s transition。reduced-motionは移動なし、focus輪郭は維持する。

### opt-in構成

- `mus-link-scope` の中で、クリック可能な既存aに `mus-chip-link`、タイトル表示に `mus-title-chip` を追加する。汎用a/chevronには適用しない。
- TYPE Aは外枠aにopt-inし、内部タイトルはspan。TYPE Bは各主要タイトルaだけにopt-in。補足 `mus-link-secondary`、機能 `mus-link-action`、非クリック `mus-card-info` の契約は維持する。
- Homeのタイトル文字はinlineで流し、末尾2文字とchevronだけ `mus-title-tail` にまとめる。短い尾部だけnowrapとしてアイコン単独行を防ぐ。タイトル全体のnowrap、固定top、負margin、不可視overlayは使わない。
- 最近の曲の主要aはblock＋fit-content/max-width、最小44px。inline-flow内でアイコンを最終文字の8px後へ置く。折返し時にもカード右端へ押し出さない。矢印の移動用に右paddingを確保。
- TOP5は既存の行全体aを維持。子要素を順位／曲名／イベント件数／歌唱回数の明示Grid項目に整理し、旧display:contentsと回数側の矢印を除去。PC4列、mobileはイベント件数を次行。その他ランキング行は変更しない。
- CSS `link-ui.css?v=2` / Home JS `4.9.6`。他ページのキャッシュ参照・markup・CSS適用は変更しない。ランキングの既存inline-flex版は表示承認済みのまま保持し、後続の共通クラス移行時に別途回帰する。共通CSSへのopt-inのみでランキング/Venueが変わることはない。

### 全サイト展開の更新計画

以下は計画であり、03ではHome2領域以外に適用しない。CSS読込だけではDOM上の役割付与や全面クリック化は完了しない。

| 順 | 対象 | 型・現クリック範囲 | 共通chip適用・変更方式 | 正式生成HTMLへの影響 |
| --- | --- | --- | --- | --- |
| 済/今回 | ブランクランキング／Home TOP5・最近の曲 | B個別a／A全文a・B個別a | ランキングは既存実装維持。Homeのみ共通chip DOM/CSS | なし。集計/派生JSON不変 |
| 1 | Song一覧 | A全文a | タイトルspan＋装飾hostのDOM追加、CSS参照 | 個別一覧のみ。Song正式HTML変更なし |
| 1 | Event一覧 | A全文a | 同上。filter/buttonをカード外で維持 | 個別一覧のみ |
| 1 | Release一覧 | 通常A、22対象はRelease a＋Song aのB | 主題span/個別aへopt-in。補足Songを外枠aに含めない。JS/HTML/CSS | 一覧のみ。遅延/3並行/通信共有回帰 |
| 1 | Venue一覧／Singer一覧 | A全文a | 既存a内タイトルへ装飾host追加、CSS参照 | 正式Song/Releaseへの影響なし |
| 2 | Event詳細 | BのSong・Singer個別a、操作D | 主要aのDOM/CSS変更。セットリスト順・リンク分離を維持 | 正式Song/Releaseへの影響なし |
| 2 | Venue詳細 | 最初/最後A全文a、他はA/C/E | 既存全面aにchip DOM追加。今回変更なし。情報構成変更と分離 | 正式Song/Releaseへの影響なし |
| 2 | Singer詳細 | BのEvent/Song a＋曲を見るD | 主要aのDOM/CSS、年フィルター・開閉保持 | 正式Song/Releaseへの影響なし |
| 2 | 通常ランキング／統計 | 主にA全文a、情報Eと切替D | タイトルspan/装飾host追加。非リンク概要を除外 | 正式Song/Releaseへの影響なし。Chart/段階描画回帰 |
| 2 | いつ振りチェッカー | B個別a、入力D | 個別主要aのDOM/CSS。計算/共有URL維持 | 正式Song/Releaseへの影響なし |
| 別承認 | Song詳細 | 収録Releaseはタイトルのみa→将来A、履歴B | **CSSのみ不可**。収録Releaseの外枠a化・内部a→span、他領域は個別aへchip | **正式117再capture＋manifest/provenance同期＋独立検証が必要** |
| 別承認 | Release詳細／R0072 | 多くはA全文a、神パラB/C/D | renderer/templateの装飾host変更。本文保持・補完契約維持 | **正式114再capture＋manifest/provenance同期＋独立検証が必要** |
| 3 | Search／共通検索・nav | 検索A、nav専用a、操作D | Searchは個別DOM/CSS。共通側はcommon.js依存を監査 | common.js変更時は両正式セット同期を要する |
| 3 | Member Analytics／神パラ専用 | B/C/D/E、表の文字a/details | タイトルaだけopt-in。Desktop/Mobile両DOMとdetailsを維持 | 当該ページのみ。集計/データ変更なし |
| 3 | About／404／その他参照 | C/Eと機能リンク | 主要タイトルcardが存在する箇所のみ個別判断、全aへの適用なし | 共通rendererを変更しなければ正式同期不要 |

正式Song/Releaseの外部CSSは現fingerprint対象外だが、templateのCSS参照変更・renderer markup変更は対象。CSSだけで静的本文とruntimeを別構造にする近道は採用しない。正式同期が必要な工程は別承認まで保留する。

### 03回帰の範囲

標準 `test:ui-links` の既存6件にHome2幅×通常/操作・reduced-motionの4件を追加。TOP5は5行すべて、最近の曲/Eventは正式snapshot由来fixture＋長い日英タイトルで測定する。末尾文字とchipの座標、SVG中央、3px移動、レイアウト不変、TYPE A余白クリック/中クリック/Enter、TYPE B分離、tap、focus、補足リンクを検証する。

古い `home-recent-singer-links.test.cjs` にはEventとSingerが同色であるという01以前の期待値が残っていた。今回正式仕様（主要濃紺・補足青＋下線）に更新し、hover/focusの装飾・寸法・IDリンク・未解決名義非リンク検証は維持する。画像は既存outputsを上書きせず毎回新規一時領域へ保存する。

今回commit/push/deploy・正式再生成は行わない。Song収録Releaseの全面リンク化、Venueの不要セクション整理/年フィルター統一/曲を見る追加は引き続き別工程。

03ローカル結果：関連回帰102/102 PASS（skip 0）。Homeの両幅×7リンクでchip30px/SVG16px、hover移動3px、a矩形不変を確認。末尾2文字とchipの間隔は8px、長い日英Eventも単独icon行/横overflowなし。TYPE A余白/中クリック/Enter、TYPE B個別リンク/tap、focus/reduced-motion正常。新規4件は既存標準 `test:ui-links` に含まれる。

独立validatorはPASS / integrity PASS / provenance VERIFIED / reusable true、Song117/Release114維持。実APIを使う別のローカルChrome新規環境でも1280/390のHome表示正常、page/console error 0、横overflowなし。表示承認用画像は一時領域 `musdb-link03-real-GbHmDP` の `top5-1280.png` / `top5-390.png` / `recent-1280.png` / `recent-390.png`。長文fixtureの画像は `musdb-ui-links-5nYTCl` に分離。実機iPhone/Safariは未検証。

Gitは基準commitのまま、関連6ファイルmodified、staged/untracked 0。正式snapshot/Revision/生成HTML/manifest、ランキングmodel/例え/派生JSON、Venueに差分なし。diff --check PASS。表示承認前のため未公開。

### FINAL：歌唱者正式表示と非ブロッキング補完

Home実APIには短縮`singer`と`singerId`のみで、`singerDisplayName`はない。承認を受け既存`singerList`を使用。実APIは`data.official`49件・`data.solo`23件、各行の`singerId`/`displayName`を提供し、SN0054=新田恵海、SN0059=三森すずこ、SN0072=飯田里穂＆久保ユリカ＆Pileを確認した。手書き変換辞書・新API・正式データ更新はない。

Homeの最近の曲を先に描画し、`apiGet`の既存cache/in-flightを利用して1インスタンス最大1回の補助取得を開始。retryCount=0、timeout15秒、TTL5分、SWRなし。失敗後の再描画でも自動再取得しない。表示優先順位は既存`singerDisplayName`→取得したMapのdisplayName→既存singer。不明IDは推測しない。取得成功時は現在存在する歌唱者aのtextContentだけを更新し、href/カード/他リンク/フォーカスを保持。既存正式表示名がある行は上書きしない。

ラベルはDOMの`span.recent-singer-label`「歌唱者：」にし、旧CSS疑似要素を除去。HTML生成はescapeHtml、後続更新はtextContentでXSS対策を維持する。

初回新規テストFAILは、応答を意図的に保留するJSONPモックの解放より前に`page.goto`の既定`load`待ちを置いたテスト内の待機循環。旧41行のgotoが30秒でTimeoutErrorとなった。診断時はHome/revision応答済み、singerList要求1件・応答保留、DOMはinteractive・5カード表示済み・status非表示・エラー0。実モックJSONもsuccess/data/official/solo構造で正常だった。`DOMContentLoaded`＋実DOM待機へ修正し、同じ失敗テストは約0.9秒でPASS。タイムアウト延長やsleep追加、production処理変更で隠していない。

成功/失敗/実15秒timeout（仮想時計）×2幅の6件を追加し、既存2件と合わせ歌唱者回帰8/8 PASS。本文先行表示・正式3名義・同ID複数行・不明ID・正式名優先・XSS・ラベル重複なし・DOM/フォーカス同一性・もっと見る後も要求1回を確認。標準`test:ui-links`へ歌唱者testファイルを追加登録。全関連回帰108/108 PASS（skip0）、独立validator PASS/VERIFIED/reusable true、diff-check PASS。

実APIを使用したローカルChrome各1回の観測では、1280pxはHomeの最初の歌唱者DOMが2.02秒、正式名3.57秒、390pxは1.69秒→2.66秒。追加通信はそれぞれ1件。これはその環境・回線での単発観測で速度保証/改善率ではない。初期表示は取得完了を待たず、名前のノードとカードは同一のまま。最終画像は新規一時領域`musdb-link03-real-Ebi9dN`へ保存。公式名義・複数名義を含む実表示と自然な折返し、page/console error0、横overflowなしを確認。

公開対象は従来6ファイル＋標準登録のtests/package.jsonの7ファイル。正式snapshot/Revision/231 HTML、ランキング、Venueは無変更。今回の公開承認に基づき、全検証後に限りcommit/push/Pages QAへ進む。実機iPhone/Safariは未検証。
