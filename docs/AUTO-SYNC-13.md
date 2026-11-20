# 自動検知・検証・Pages公開（未有効化）

## 現状と判定

実装基準はDraft PR #1の`fd9fc3858181ba446faeef14c0b68db464e49027`、成功run 44503302558。既存generator、batch client、通信ガード、canonical-final-head-v1、validator、provenance、verified switchは変更しない。

現行公開mainは`431782937b68eb2beca42d665b2176cf01a9b609`。Pages #339（run 44139742806）の動的`pages-build-deployment`はmainをcheckoutし、`path: .`をartifact化して公開している。公開設定APIの無認証GETは404だったため、管理設定画面のbuild_type・保護ルールを取得済みとは扱わない。履歴で確認できた公開元はmain/root、build/deploy権限はContents read / Pages write。

**本番有効化はBLOCKED。** v65のrevision応答には管理GAS処理の完了証拠がない。AUTO-SYNC-19で署名付き照合をローカル接続した。受理・送信・公開はOFFで、安定したRevisionの反復観測を完了証拠に代用しない。

## PC・スマホの確定経路

保存済み・読取り照合済み管理GAS v26では、PC `updateAll()` → `runDatabaseUpdateWithLock_({source:"pc"})` → `executeDatabaseUpdateCore_()`。スマホの既存ジョブも同じScript Lockと共通更新本体へ合流する。

全更新step成功後だけ`finalizePublishedDatabaseUpdateRawV490_()`が共有dataRevisionを確定する。しかし更新ログの記録はその後で、ログ記録失敗なら全体結果はfailedになる。したがって「新しいRevisionが見えた」だけでは「すべて更新の正常完了」を証明できない。管理側のgetAdminUpdateStatusは認証された別プロジェクトの状態で、公開APIから取得できるとは仮定しない。PCセル編集の自動実行、updateAll本体、スマホの書込経路は変更していない。

## 構成

```mermaid
flowchart LR
  M[PC手動更新 / 既存スマホ更新] --> G[GAS更新完了・確定Revision]
  G --> W[15分監視 / 読取りのみ]
  W -->|同一データ・同一source / 検証済| N[NO_OP]
  W -->|完了証拠不足 / 更新中| X[BLOCKED / 次回監視]
  W -->|変更あり・完了証拠あり| B[直列publisher / 正式生成・検証]
  B --> A[完全なpublic site artifact]
  A --> D[直前のRevision・main・重複検査]
  D --> P[別権限job / Pages deploy]
  P --> V[実HTTP・hash・Revision検証]
  V --> S[workflow成功で最終公開済と判定]
```

`.github/workflow-templates/`は非稼働の保管場所。scheduleも公開workflowも現在の`.github/workflows/`へ設置していない。`tools/auto-sync/config.json`のenabled=falseとrepository variable未有効化の二重停止も維持する。

### 監視

- 毎時7/22/37/52分（UTC）にrevisionをGETし、現行公開の両Revisionとsource fingerprintを比較する。一致する場合はNO_OPで終了する。初回または変更時に限り、別途承認された設定で同じGAS URLへ署名POSTし、厳密な完了証拠を取得する。
- 実ドメインのcurrent、snapshot manifest、小さい公開receipt、および対応するGitHub runの成功を確認する。Git mainのcurrentはartifact公開後に古くなり得るため最終公開済の正本にはしない。
- source fingerprintはWeb/renderer/生成コード・sidecar・workflow・lockfileを含み、生成snapshot/current/gapは除外する。データ更新による自己再生成ループを避け、Webコードだけの変更も検出する。
- 監視自体は全件API・Chrome・generatorを起動しない。変更なしはNO_OP。初回のreceiptなしはbootstrapであり、未確認を「公開済の同一source」にしない。
- 失敗したpublisherは同じmain HEADで無条件に再実行しない。監視から失敗run IDを明示承認して再試験する。run中に新Revisionへ変わった場合は公開せずsupersededとし、次の監視で最新を再検出する。

### 生成・検証

- 新しいデータ世代は既存正式generatorに`--event-transport=batch-v1 --event-batch-size=8`を明示する。通常の手動generatorはlegacyのまま。
- 既に公開されている同一世代のJSONは、公開file manifestのbytes/hashで検証して保持する。同一世代のWeb再構築は既存Song/Release正式producerで231ページをcaptureし、JSONを再生成して同じRevision URLのbytesを変えない。
- 新世代のEvent件数・歌唱行数は取得結果から独立集計する。357件/1,415行は検証済み基準であり、今後の新規イベント追加を永久に拒否する固定値にしない。Song117/Release114、両経路の歌唱行多重集合、ID/順序、既存Eventの欠落は厳密に検査する。
- 既存の固定データ向け回帰は取得済みの不変baselineに対して生成前に実行。生成した新世代は独立validator/参照・多重集合検査、実画面4条件で検証する。成功済みassertやgolden hashは変更しない。
- 実Chrome158 / Playwright1.62.1 / Node24.19.0 / 日本語fontを既存CI同様に固定。capture231、verified switch追加0、canonical全231件、validator/integrity PASS、provenance VERIFIEDが必須。
- gap/share/sitemapは生成後にcheckも実行する。生成前後・公開直前・公開後に両Revisionと完了世代IDを照合する。
- 音源JSON・クレジット等を含むsource fingerprint不変を確認。Pages siteにはroot公開HTML、assets/data/song/release/shareなどのpublic出力だけを入れ、tools/tests/GAS/非公開入力/生HTTPを含めない。

### 同時実行と失敗

監視は軽量の独立workflow。publisher全体を`musdb-pages-production`という1つのconcurrency groupで直列化し、cancel-in-progress=falseにする。監視のpendingが置換・遅延しても、次回は実公開状態と最新Revisionを再比較する。キュー順を正しさの根拠にしない。

公開jobはcontents/actions readにpages write / id-token writeだけを追加し、github-pages environmentを使用。buildは書込権限なし。Pages upload後にもfreshness gateを置き、実deploy actionへ進む直前に再確認する。旧branch公開など別経路を残すと直列化の外から上書きできるため、有効化時に公開元の切替と全公開経路の統一が必須。

Pages artifactのアップロード後、署名POSTで両Revisionと完了世代を再照合する。最終照合後からPages反映までにGAS更新が始まる余地がある。公開後も署名で世代を確認し、不一致は公開完了の記録を止めてfailedにする。復旧は別承認とし、検証済公開には対応workflowの成功を要求する。

## 状態とスマホ向け接続

- `state.json`/`state-history.jsonl`とGitHub job/stepからwaiting/generating/validating/deploying/published/failed/supersededを取得できる。
- 実公開`data/sync-release.json`にはRevision、source SHA/fingerprint、run URL、file manifest hash、前回の検証済receiptを保存する。これはdeployed candidateの識別情報で、記載だけで成功とはしない。対応GitHub workflow成功とHTTP検証が必要。
- `data/sync-files.json`は全publicファイルのbytes/hash。前回snapshotを公開CDNから検証して引き継げるため、GitHub artifact期限切れを通常更新の必須障害にしない。既存snapshotを自動削除しない。siteが保守的な900MiB上限を超える場合は公開停止し、別途承認した保存方針を決める。
- 将来のスマホ画面は公開revision/readiness、実site receipt、GitHub runから`publicState()`の形式へ集約する。GAS更新成功/API反映とPages公開成功を別表示する。現行管理UIの「Web反映」はPublic API一致の意味であり、今回は修正していない。
- ブラウザにGitHub tokenを埋め込まない。公開runのリンク表示を基本とし、必要なら管理側の認証済read-only集約・cacheを別承認で追加する。取得不可はunknownで、0件や成功にはしない。

## 運用・有効化

1. readinessの権威ある完了証拠を準備・実HTTP検証（次文書）。管理GAS v26のupdateAll本体を変えず、共通hook等でPC/スマホ双方をカバーする案を別途承認する。
2. 現在のPages設定/environment/公開元を所有者権限で読取り確認。公開中の完全なsiteを保存し、復旧先のrun/artifact/hashを確定。
3. Draft PR #1へ今回差分を反映する承認を取得。まずread-only safety trial。新pipelineのmock試験と本当のGitHub Pages/OIDC実行は区別する。
4. main統合・Pages sourceをGitHub Actionsへ切替・environment保護・repository variable・configの有効化を別途承認。旧branch publisherとの併存を避ける。
5. 最初は人の確認付きで初回bootstrap→HTTP検証まで実施。その後scheduleを有効化。Gitへの自動commit/push権限やPATは不要。

15分は検知間隔であり完了保証ではない。AUTO-SYNC-12の実測はjob約21分22秒、正式生成＋capture約17分14秒。通常の反映目安は更新完了から約20〜40分＋キュー/ネットワーク時間。生成中の再更新、CDN、schedule遅延・欠落、公開repoの長期無活動によるschedule停止があればさらに遅れる。96回/日の監視はNO_OP中心とし、生成は必要時だけ。

## 復旧・通知

- 生成/検証失敗ではPages artifactを公開しない。siteの部分公開は行わず、証拠を保存する。
- 公開前にsupersededなら次回監視へ。実API/Chrome/validatorの異常は失敗run IDを記録して、原因確認・明示的な再実行承認を待つ。
- deploy/公開後QA失敗では自動rollbackや再pushをしない。先にschedule/variableを停止する操作の承認を得て、前回verified runのsite artifact（または保存済みsite）とhashを検証し、承認後に同じPages deployment方式で復旧し、実HTTP確認する。GAS/RAW/Revisionを巻き戻さない。
- artifactは14日保管のテンプレート。重要な初回・last-known-good siteは別途承認した長期保存が必要。期限切れ時に不明なsiteを復旧元にしない。
- GitHub標準の失敗通知・Actions summary/runリンクを推奨。通知設定、メール/外部サービス追加、実通知送信は今回は行わない。

## 残る実環境試験

新workflowのPR/Actions実行、readiness bridge実HTTP、Pages source切替/OIDC deploy/実CDN後検証は未実施。AUTO-SYNC-11のGoogleサーバー故障注入（途中Revision変更・強制部分応答・45秒/512KiB超過）も未実施のまま。mock/local負例PASSで代替しない。

公式仕様：
- [Custom Pages workflows / Pages artifact・権限](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)
- [Publishing source / GITHUB_TOKEN pushとPages build](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [Scheduleの遅延・欠落・default branch制約](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)
- [Concurrencyとキュー制約](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)
