v4.7 STEP13-C 追加修正
検索フォーム下の空の白い横長ボックスを削除

GitHub差し替え:
・search.html のみ

原因:
検索状態表示用 #status が空でも、共通CSSの見た目だけ残って白いボックスになっていました。

修正:
・.search-page .status.hidden を display:none!important
・空の status も display:none!important

検索中 / エラー時は従来どおり表示されます。

確認:
1. search.html?q=えみつん
2. 検索フォーム直下の空白い箱が消えている
3. 検索結果はそのまま表示される
