# v2.6.1：統計UI改善＋About定義追記＋曲クイックナビ追加

## Apps Script側

### 丸ごと差し替え

- DiscoverApi.gs

ApiMain.gs、HomeApi.gsの変更はありません。

保存後、新バージョンとして再デプロイしてください。

## GitHub側で上書き

- statistics.html
- about.html
- song.html
- assets/js/statistics.js
- assets/js/about.js
- assets/js/song.js

## 1. 統計UI改善

- 棒グラフが数値に応じて確実に伸びるよう修正
- 最大年を背景色と「最多」ラベルで強調
- 期間合計・最多の年・年平均を追加
- 25%刻みの目盛り背景を追加
- マウスを重ねると年と件数をツールチップ表示
- スマホ表示を調整

## 2. About定義追記

公式イベント：
μ's名義、またはμ'sメンバーとして出演・歌唱したイベント。

ソロイベント：
声優本人が個人名義・個人アーティスト名義で出演・歌唱したイベント。

区分は主催者やイベント規模ではなく、出演・歌唱時の名義を基準にすることも明記しています。

## 3. 曲クイックナビ

曲詳細のヒーロー直下へ追加：

- 前の曲
- 全曲プルダウン
- 次の曲

曲マスターの登録順で切り替えます。画面には曲名のみを表示し、内部IDは見せません。

## API確認

https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec?action=discover&type=song&id=S003&callback=callbackTest

`data.navigation.previous`、`data.navigation.next`、`data.navigation.songs`が返れば正常です。

## 公開確認URL

統計：
https://xenotopi.github.io/mus-song-database/statistics.html?build=261

About：
https://xenotopi.github.io/mus-song-database/about.html?build=261

曲：
https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=261
