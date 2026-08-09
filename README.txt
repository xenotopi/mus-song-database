v4.7 STEP13-C 検索結果ページ 修正版

原因:
search.html が旧export名
・common
・esc
・fmt
をimportしていたため、module script全体が読み込み時点で停止していました。

現行export:
common.js → renderCommon
api.js → escapeHtml / formatDate

修正:
・common → renderCommon
・esc → escapeHtml のローカルalias
・fmt → formatDate のローカルalias

GitHubへ search.html のみ差し替えてください。
Apps Script変更なし。

確認:
search.html?q=スノハレ
search.html?q=すのはれ
search.html?q=えみつん
search.html?q=そらまる

URLのqが検索欄へ入り、結果が表示され、
共通ヘッダー/フッターも表示されればOKです。
