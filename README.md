# v2.7 Performance Update

## 今回の目的

表示速度そのものと、待っている間の体感速度を改善します。

主な改善：

1. GAS側キャッシュ
2. ブラウザ内キャッシュ
3. 同一APIの二重通信防止
4. ホーム画面の段階表示
5. 古いキャッシュを先に表示し、裏で更新

---

## Apps Script側

### 丸ごと差し替え

- ApiMain.gs

### 新規追加

- CacheApi.gs

保存後、次の順で実行してください。

1. `testApiCache`
2. ログで2回目が `hit:true` になることを確認
3. `testPerformanceApi`
4. 新バージョンで再デプロイ
5. アクセス権は「全員」を維持

### キャッシュ時間

- ホーム：10分
- ランキング：15分
- 統計・About：30分
- 曲・イベント・会場・関連データ：15分
- 検索：5分

データ更新直後は `resetApiCache` を実行してください。

---

## GitHub側

`github`フォルダ内を同じ階層へすべて上書きしてください。

### HTML

- index.html
- song.html
- event.html
- venue.html
- search.html
- rankings.html
- statistics.html
- about.html

### JavaScript

- assets/js/api.js
- assets/js/common.js
- assets/js/home.js
- assets/js/song.js
- assets/js/event.js
- assets/js/venue.js
- assets/js/search.js
- assets/js/rankings.js
- assets/js/statistics.js
- assets/js/about.js

---

## 表示速度の変化

### 初回アクセス

初回はGASがデータを作成するため、一定の待ち時間があります。
ただし、ホームの枠組みを先に表示し、スケルトン表示へ変更しています。

### 2回目以降

同じタブ内では sessionStorage のデータを先に使うため、
ホーム・詳細・ランキング等が大幅に早く表示されます。

GAS側にもキャッシュがあるため、別端末・別ブラウザでも、
直前に誰かが同じAPIへアクセスしていれば応答が短くなります。

---

## 確認URL

ホーム：

https://xenotopi.github.io/mus-song-database/index.html?build=270

曲：

https://xenotopi.github.io/mus-song-database/song.html?id=S003&build=270

統計：

https://xenotopi.github.io/mus-song-database/statistics.html?build=270

---

## 補足

初回アクセスを完全に0秒にすることはできません。
Apps Scriptの起動待ちとスプレッドシート読込があるためです。

今回の更新では、

- 初回：画面の骨組みを先に表示
- 2回目：ブラウザキャッシュから即時表示
- API：GASキャッシュから高速応答

という3段構成にしています。
