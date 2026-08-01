# v2.0：ホーム画面完全API化版

## Apps Script側
新規追加：
- HomeApi.gs

丸ごと差し替え：
- ApiMain.gs

前提：
- RankingApi.gs が存在すること

保存後、`testGetHomeData`を実行し、summary / today / recentPerformances / topSongs / topVenues が出れば成功です。
その後、新バージョンで再デプロイしてください。

JSONP確認：
https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=home&recentLimit=5&callback=callbackTest

## GitHub側
上書き：
- index.html
- assets/js/home.js

確認：
https://xenotopi.github.io/mus-song-database/?build=205
