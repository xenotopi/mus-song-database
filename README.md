# v3.8.2：完全体判定基盤＋曲ページ復旧版

## GitHub側

### 上書き
- song.html

### 新規追加
- assets/js/song-v382.js

### 削除可能
- assets/js/song-v381.js

## Apps Script側

### 上書き
- Config.gs
- SongApi.gs
- ApiResponse.gs
- ApiMain.gs
- CacheApi.gs

### 新規追加
- PerformanceJudge.gs

## 完全体判定

歌唱者マスターを次の構成で参照します。

- A列：歌唱名義キー
- B列：展開後のメンバー
- D列：曲名
- E列：本来の歌唱者

判定手順：

1. 曲名から正規歌唱者パターンを取得
2. μ's・ユニット・組み合わせ名義を個人名へ展開
3. 実際の歌唱者も同じ方法で展開
4. 人数とメンバーが完全一致すれば完全体
5. 不一致は人数不足・人数超過・歌唱者違いに分類
6. START:DASH!!（3人）／（9人）は共通キーへ正規化

## APIで返す統計

- completePerformanceCount
- irregularPerformanceCount
- unregisteredPerformanceCount
- shortageCount
- excessCount
- mismatchCount
- completeRate

## 反映手順

1. Apps Script側の5ファイルを上書き
2. PerformanceJudge.gsを新規追加
3. Webアプリを新バージョンで再デプロイ
4. GitHubへsong.htmlとsong-v382.jsを反映
5. Ctrl + F5で再読み込み
6. 曲切り替え、完全体率、年別フィルター、📀アイコンを確認

## 動作確認

Apps Scriptで次を実行できます。

- testApiPerformanceJudge_

Snow halation / μ's が「完全体歌唱」になれば判定基盤は正常です。

## 補足

CacheApi.gsのキャッシュバージョンをv3.8.2へ上げているため、
旧Song APIレスポンスは自動的に使用されません。
