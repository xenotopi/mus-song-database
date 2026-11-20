# 更新完了証拠と公開状態の接続契約（ローカル実装・本番無効）

## 必要な理由

既存v26の共通処理は、更新各step成功→共有Revision確定→更新ログ書込み→全体結果確定の順。更新ログ失敗ならRevision更新済みでも全体failed。公開API v65のrevisionはこの全体結果を返さない。Script Lockも別プロジェクトの公開APIから直接確認できない。

そのため現状のv65だけでは厳密な「PC/スマホの全更新が正常完了」を自動判定できない。今回のWeb実装はready証拠なしで公開しない。15分待ち、2回同じhash、イベント登録成功、Public API反映成功などを代用品にしない。

既存`getAdminUpdateStatus_()`はstaleジョブを検出すると状態保存・trigger削除を行う場合があるため、今回のread-only監視から呼ばない。将来の完了証拠accessorも、副作用のない読取りとして別途確認する。

## 署名付きreadiness応答

公開APIのrevisionは軽量GETのまま。既存deploymentの署名付きPOSTのみが厳密照合を要求できる。匿名GETと未署名POSTは入力走査前に拒否。署名受付のScript Property未設定時はOFF。Actionsも`signedReadiness.enabled`と`MUSDB_SYNC_SIGNING_ENABLED`の両方が明示的に有効になるまで署名POSTを送信しない。公開には既存の別フラグが必要。署名のないreadinessは公開判定に使わない。

署名はv2の正規化配列を維持し、HTTP用途、対象環境、鍵ID、発行時刻、nonce、両Revision、fingerprint、source SHA、リポジトリID、workflow/ref、処理段階、run、attemptを結ぶ。対象は保護されたmainのmonitor/publisherと許可された段階に限定する。署名内のrun情報は鍵保有者の申告なので、Actions側でも実行元とmain SHAを照合する。スキャン前にnonceをScript Lock下で保存・読戻しする。台帳破損、書込み例外・読戻し不一致、ロック競合時は拒否する。

将来の鍵は承認後に保護Environmentへ登録し、署名するCLIステップだけへ渡す。CLIは子プロセスを起動する前に鍵を環境から除去する。本番秘密値・署名本文・応答のリダイレクトURLをログやartifactに保存しない。

```json
{
  "schemaVersion": 1,
  "authority": "shared-update-completion-v1",
  "state": "ready",
  "dataRevision": "sha256-<64 hex>",
  "outputRevision": "sha256-<64 hex>",
  "completionId": "<公開可能な不透明な世代ID>",
  "source": "pc",
  "allStepsSucceeded": true,
  "updateLogWritten": true,
  "activeUpdate": false,
  "completedAt": "<ISO8601>",
  "observedAt": "<fresh ISO8601>"
}
```

- stateはready/running/failed/unknown。readyだけが候補を認可する。
- 全stepとログ成功後の1世代に結び付くこと。開始時に前回readyを無効化し、実行中/失敗/タイムアウトをreadyへ戻さないこと。PC・スマホの共通入口をカバーすること。
- PCのupdateAllは引き続き手動。スマホは同一世代を再予約できる非同期実行を維持する。管理GAS候補はBEGIN、必須処理・ログ、スマホ後処理、receipt、READYの順序を検証済み。本番への反映は別承認。
- 両Revisionは公開APIの現在の世代と一致。dataRevisionだけ一致してoutputRevisionが違う証拠は拒否。APIデータ版だけを変更する際のoutputRevision導出も管理/API間で明確にする。
- freshなobservedAtは120秒以内、completedAtから最低60秒の落着きを要求。ただしこれは本物の完了証拠への追加条件であり、時間待ちが完了を証明するのではない。
- Script/Spreadsheet ID、ユーザーメール、RAW行、内部例外stack、認証情報を出さない。completionIdは個人情報や内部IDを直接使わない。
- 変更検知時・生成前後・公開直前・公開後に同一世代と両Revisionを確認する。Pages artifactのアップロード後にGASがRUNNING、または世代が変化した場合はdeployを止める。最終照合から実公開までの競合は残る。

## スマホ向け公開状態

管理側の既存API反映表示はそのまま維持する。将来の表示は`policy.publicState()`を利用し、次を別項目にする。

1. 最新確定GAS/API Revisionと更新処理状態
2. 最終HTTP検証済みPages Revision・公開日時
3. waiting/generating/validating/deploying/published/failed/superseded
4. Actions run URLと、公開可能なエラー分類・再実行条件

実site receiptは対応publisher workflowのsuccessが必要。失敗した現在のreceiptを最終公開成功と扱わず、GitHub successを確認したpreviousVerifiedを保持する。公開されたcandidate JSONだけのpublished=trueは採用しない。

公開状態の読取りは、公開revision・実site receipt・公開GitHub runで行う。厳密readinessは管理用途の署名クライアントに限定する。詳細artifactが必要なら管理者権限のある既存バックエンドで集約し、鍵やtokenをスマホHTMLへ渡さない。取得不可・rate limitはunknownで表示する。

## 次の承認対象

1. 署名受付OFFで公開API候補を先行反映し、旧actionと匿名readiness拒否を確認するための承認。
2. 所有者によるPagesの公開元・environment・権限の読取り確認。
3. Draft PR #1へ今回差分をcommit/pushする対象hashと、contents:readだけの新規safety試験。
4. readiness実環境PASS後、main統合・Pages設定切替・初回有人公開・schedule有効化。

この順序を飛ばしてenabled=trueにしない。今回のlocal mock成功はGoogle/GitHub本番の原子性・権限・故障注入の保証ではない。

初回workflow_dispatchはdefault branchに定義が必要なので、Draft PRだけで試す際はread-only safety templateを承認後にactive workflowパスへコピーし、同じPRブランチ限定のpull_request起動を使用する案とする。workflow_dispatchは維持し、pull_request_targetや書込権限は付けない。現在はtemplateを保存しただけで、commit/push/Actions起動は行っていない。
