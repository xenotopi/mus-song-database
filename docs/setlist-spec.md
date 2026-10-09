# Setlist・歌唱順仕様

μ's Song Database の Event／歌唱RAW／Public API に共通する歌唱順の定義。番号は歌唱記録の行単位で保持し、Song ID 単位に集約しない。

## 順位の定義

`setlistPosition` は、当該 Event における**全歌唱パフォーマンスの通し順**を表す正整数。μ's、他アーティスト、他作品楽曲、オープニングアクト、アンコールの歌唱を数える。MC、トーク、映像、朗読、告知、インストゥルメンタルのみの演奏、オーケストラのみの劇伴・サントラ演奏は数えない。DB に登録した曲だけで再採番しないため、フェスや合同イベントでは DB の歌唱行の番号が飛んでよい。アンコールは本編から連番とし、1 に戻さない。

オーケストラコンサートではキャストによる歌唱パフォーマンスを歌唱順に 1、2、3…と数え、オーケストラのみの演奏を除外する。これは「DB 曲だけで再採番」する扱いではなく、非歌唱演奏がもともとカウント対象外であることによる。

出典上、複数曲が同じ歌唱スロット・同じ番号で扱われるメドレーは、複数の歌唱RAW行に同じ `setlistPosition` を付けられる。同位置内は元のRAW登録順を副順序として維持する。出典が別番号としている曲を独自判断でまとめない。同一 Event で同じ Song が再登場しても別行のまま保持し、例えば同一 Song が位置 1 と 18 に現れてよい。

`relativePosition` は、イベント全体の絶対歌唱順が確定しないときに、当該 Event 内の **μ's 関連歌唱だけ**について確認できた相対順を保持する補助項目。例えば他出演者を含む収録全体の歌唱位置は不明でも、μ's 関連歌唱 A → B → C だけ確認できる場合は、それぞれ `setlistPosition = null`、`relativePosition = 1 / 2 / 3` とする。相対順を絶対順の列へ代入しない。

TV 番組・番組収録で μ's が 1 曲しか歌っていなくても、収録全体の何番目の歌唱か不明なら `setlistPosition = 1` としない。全出演者を含む順が確認できれば絶対順、一部の μ's 関連歌唱の順だけなら相対順、どちらも不明なら両方 `null` とする。フェス・合同イベントでも出演ブロック内だけの順位を絶対順として扱わない。

## Event の確定フラグと整合性

`songOrderIsSetlist` は Event 側の boolean。`true` は**当該 Event に DB 登録されている全歌唱行のイベント全体での `setlistPosition` が確定済み**であることを意味する。イベントで歌われた全楽曲が DB に登録済みであることや、公式一次資料だけで確認したことは意味しない。`false` は全行の絶対歌唱順を確定できていない状態を表す。一部の行だけ絶対順が判明していても、全行が揃うまで `true` にしない。

| 状態 | `setlistPosition` | `relativePosition` | `songOrderIsSetlist` |
| --- | --- | --- | --- |
| ABSOLUTE | 全DB歌唱行で正整数 | `null` | `true` |
| RELATIVE_ONLY | `null` | 確認できた相対順は正整数 | `false` |
| UNKNOWN | `null` | `null` | `false` |

同一歌唱行で `setlistPosition` と `relativePosition` を併用しない。両値は正整数または `null` であり、`true` の Event に `setlistPosition` 欠損行があれば不完全として扱う。段階投入中の `false` Event に `setlistPosition` のある行があっても、確定フラグは自動的に `true` としない。

## 正本・API・Static

歌唱RAW は A:H を既存項目のまま維持し、I 列が `setlistPosition`、J 列が `relativePosition`。Event マスターの `songOrderIsSetlist` は Event 側の正本値。読取処理は旧 8 列、9 列、現行 10 列の歌唱RAWに対応し、列がない場合や空欄は `null`（Event フラグ未設定は `false`）として扱う。既存列を移動しない。

Public API v5（`publicApiDataVersion = "5"`）の Event `songs[]` は `setlistPosition: positive integer | null` と `relativePosition: positive integer | null` を出力する。`relativePosition` 追加が v5 への変更理由。Static も両値を保持し、旧世代で項目がない場合は未設定として扱う。

## 出典と確認

根拠の優先順位は、公式資料、公式SNS・公式セットリスト、信頼できる公演記録、LLfans等の整理資料、参加者レポートとする。Event ID、日付、Day、昼夜・公演を一致させ、各RAW行と曲・歌唱者・再登場の対応を確認する。他公演の順番を流用せず、推測で番号を付けない。複数資料が矛盾する場合は確定せず保留する。

## 現行UI

Event Detail は `songOrderIsSetlist = true` かつ全歌唱行の絶対順が有効な場合、`setlistPosition` 順で表示し、その実位置番号を示す。同位置は元RAW順を維持する。

`songOrderIsSetlist = false` で全歌唱行に有効な `relativePosition` がある場合は、相対順で表示する。同順位は元RAW順を維持し、番号には「歌唱順 1」のように明示する。曲一覧付近には、イベント全体の曲順ではなく μ's 関連歌唱内で確認できた順である旨を注記する。相対順位が一部の行で欠損している場合は、順位を推測せず、全行を従来のRAW登録順で表示する。絶対順・相対順ともに使えない場合も従来表示を維持する。
