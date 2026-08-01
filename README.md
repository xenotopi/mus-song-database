# v2.0 Foundation：Ranking JSONP対応版

## Apps Script側
新規追加：
- RankingApi.gs

丸ごと差し替え：
- ApiMain.gs

保存後、`testGetRankings`を実行し、summary / songs / events / venues が出れば成功です。
その後、新バージョンで再デプロイしてください。

JSONP確認：
https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=rankings&limit=20&callback=callbackTest

## GitHub側
上書き：
- rankings.html
- assets/js/rankings.js

確認：
https://xenotopi.github.io/mus-song-database/rankings.html?build=204
