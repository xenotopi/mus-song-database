# μ's Song Database — Web開発の作業境界

## 適用と承認

- この指示は、このファイルを配置した承認済みWeb checkoutの配下だけを対象とする。兄弟clone・元dirtyツリー・GASプロジェクトへの変更権限を与えない。
- システム／開発者指示と現在のユーザー承認を優先する。過去タスクの実行例・公開承認・スクリプトの存在を、今回の操作許可と解釈しない。
- 着手時は、新規cloneを含め、当該checkoutの情報・現在のGit状態・現在のユーザー承認から、対象checkout・作業基準・承認範囲を特定する。固定SHAをこの指示へ埋め込まず、基準とGit状態を照合する。特定できない場合や想定外の状態なら、推測で変更せずSTOP。
- 現在のタスクで外部の引き継ぎ資料（HANDOFF・baseline等）が明示された場合は、指定資料を必ず読み、対象checkout・作業基準と照合する。参照できない場合は推測せずSTOP。外部資料が指定されていない新規cloneに、旧作業フォルダの存在を要求しない。

## 作業先と保護

- HEAD・branch・origin/main・staged・tracked/untrackedを読み取り確認する。候補コピー、公開checkout、元dirtyを区別し、元dirtyや旧候補を自動同期・清掃しない。
- 既存dirty/untracked、過去のFAIL・HAR・trace・バックアップを保持する。許可範囲の開始／終了hash・Git状態を記録し、秘密値・個人情報を報告へ転載しない。
- 正本Spreadsheet、GAS、公開API、RAW、snapshot/current、Revisionは、現在のタスクが明示的に承認した場合を除き変更しない。認証・依存・Git設定の変更も勝手に行わない。
- 既存の共通部品・ID・URL契約を再利用し、依頼外のUIやデータへ広げない。表示名・所属・歌唱記録・集計を混同しない。

## 生成と検査

- テスト／正式生成は、現在の承認範囲に必要なものだけ実行する。READMEの実行例や過去の件数を根拠に全面再実行しない。
- Song/Releaseは対象checkoutの既存generatorで正規生成する。正式HTML・manifest・fingerprint・captureProvenanceを手書きで合わせない。独立validatorは生成・修復の代用にしない。
- `generate-static-snapshot.cjs`を閲覧のためにimport/実行しない。current切替もSong/Release生成を伴うため、単なるポインタ変更と扱わない。
- 受信／保存HTMLと実行後DOMは別の契約で検査する。正規の動的追加を無条件に消去・許容しない。Song/Release別component、初期Disc開閉状態、実API補完の根拠を確認する。
- ハーネス再利用前に対象SHA、baseline、入力原本、出力先、依存junction、環境変数、browser、mock/実APIの区分を確認する。旧タスク用ランナーをそのまま次タスクの公開処理に使わない。
- 新規FAIL・不整合は証拠を保存してSTOP。原因未確定のretry/再生成、assert削除、SKIP化、期待値・timeoutの無断緩和でPASSにしない。既存別件FAILと今回の結果を分離する。
- 結果には実行条件・対象・sourceRunとPASS/FAIL/SKIP/未実施を記録する。過去PASS・先行ゲートを重複加算しない。hash/VERIFIEDを、一次資料の真実性や本番操作の保証へ拡大しない。

## 公開

- 実装、生成、QA、stage、commit、push、deployの許可をそれぞれ確認する。ローカル承認は公開承認ではない。
- 公開承認時も対象パスとhashを厳密に限定し、明示stageする。`git add .`/`git add -A`、無関係な差分、force pushは禁止。想定外のremote進行は自動merge/rebaseせずSTOP。
- Pages成功・公開SHA一致・独自ドメイン配信・PROD操作は別に記録する。許可された完了条件でSTOPし、次タスクへ進まない。
