# v4.2.1：ランキング内検索削除＋歌唱名義詳細版

## 変更1：ランキング内検索を削除
ランキングページは以下の操作に整理します。

- 対象年
- イベント区分
- 並べ替え
- タブ
- POPULAR VIEWS

## 変更2：歌唱名義ランキングの遷移先
従来：
- 歌唱名義 → 横断検索

v4.2.1：
- 歌唱名義 → 歌唱名義詳細ページ

詳細ページ表示：
- 歌唱記録数
- 歌唱曲数
- 出演イベント数
- 公式イベント数
- ソロイベント数
- 歌唱曲一覧
- 歌唱履歴
- 曲詳細／イベント詳細へのリンク

## GitHub側

### 上書き
- rankings.html

### 新規追加
- assets/js/rankings-v421.js
- singer.html
- assets/js/singer-v421.js

### 削除可能
- assets/js/rankings-v420.js

## Apps Script側

### 上書き
- ApiMain.gs
- Config.gs
- CacheApi.gs
- RankingApi.gs

### 新規追加
- SingerApi.gs

## API
新規action：
- singer

API_VERSION：
- 4.2.1

## 反映順
1. Apps Scriptを反映
2. 新バージョンとして再デプロイ
3. GitHub側を反映
4. Ctrl + F5
5. ランキング→歌唱名義→任意の名義をクリック
6. 件数・歌唱曲・履歴を確認
