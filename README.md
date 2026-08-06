# v4.0.1：Secret Memory UX改善版

## GitHub側

### 上書き
- index.html

### 新規追加
- assets/js/home-v401.js
- assets/js/secret-memory-v401.js

### そのまま使用
- assets/js/birthday-data-v400.js
- assets/js/about.js

### 削除可能
- assets/js/home-v400.js
- assets/js/secret-memory-v400.js

## 修正内容

- 「甜甜天使が誕生！」の後で改行
- 再抽選ボタン押下時に0.2秒の抽選演出
- ボタンの縮小・抽選中表示
- カードのフェード切替
- 再抽選時は可能な限り現在と違うカードを表示
- Secret Memory IDを表示
- 排出率表を追加

## 排出率

現在のweightから自動計算します。

- COMMON：80 / 85 = 94.1%
- SUPER RARE：4 / 85 = 4.7%
- LEGEND：1 / 85 = 1.2%

将来weightを変更すると、表示率も自動更新されます。

## Apps Script側

変更はありません。
