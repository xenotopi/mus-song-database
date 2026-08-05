# v3.5.1：タイトル・meta description・OGP

## GitHub側

ZIP内の `github` フォルダの内容を、GitHub Pagesのルートへ上書き・追加してください。

### 上書き

- index.html
- song.html
- event.html
- venue.html
- rankings.html
- statistics.html
- about.html
- search.html

### 新規追加

- 404.html
- manifest.webmanifest
- robots.txt
- sitemap.xml
- assets/js/seo-v351.js
- assets/images/og-default.png
- assets/icons/favicon.svg
- assets/icons/favicon-32.png
- assets/icons/apple-touch-icon.png
- assets/icons/icon-192.png
- assets/icons/icon-512.png

Apps Script側の変更はありません。

---

## 実装内容

### ページタイトル

詳細ページはAPI表示後に自動更新します。

例：

- Snow halation | μ's Song Database
- イベント名 | μ's Song Database
- 会場名 | μ's Song Database
- 「Snow」の検索結果 | μ's Song Database

### meta description

曲・イベント・会場・検索語に合わせてブラウザ上で更新します。

### OGP / Twitter Card

全ページに共通OGP画像と基本情報を設定しています。

注意：
GitHub Pagesは静的サイトのため、X・LINE・Discord等のクローラーには
HTMLへ最初から記載された「ページ種別ごとの共通タイトル」が使われる場合があります。
曲名・イベント名・会場名まで含む個別OGP画像は、
将来の静的ページ生成またはサーバー側生成で対応するのが確実です。

### canonical

現在実際に利用しているGitHub PagesのURL形式を正規URLにしています。

例：

- song.html?id=S0001
- event.html?id=EV0001
- venue.html?id=VE0001

### favicon / Manifest

ブラウザタブ・ホーム画面用アイコンを追加しました。

### フッター

`Web Prototype v2.7` を廃止し、JavaScriptで次へ置き換えます。

- Version 3.5.1
- © μ's Song Database Project

### 404

遊び心のある404ページを追加しています。

---

## 確認

反映後は一度 `Ctrl + F5` で強制再読み込みしてください。

確認項目：

1. ブラウザタブに各ページ名が表示される
2. 曲・イベント・会場詳細は読み込み後に固有名へ変わる
3. 検索結果は検索語を含むタイトルになる
4. ブラウザタブにμアイコンが表示される
5. フッターがVersion 3.5.1へ変わる
6. 存在しないURLで404ページが表示される
