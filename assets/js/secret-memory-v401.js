export const SECRET_MEMORY_DATA = Object.freeze([
{
  id:"SM0001",
  rarity:"LEGEND",
  category:"名言",
  title:"μ'sキャスト名言集",
  text:"「原理の皆さん、ご安心ください。横浜でもμ'sに会えます！」",
  enabled:true
},
{
  id:"SM0002",
  rarity:"LEGEND",
  category:"トーク",
  title:"伝説の後輩トーク",
  text:"μ'sキャストからシリーズの後輩ちゃんに対して「ダンスは上手」とべた褒めする伝説のトークが存在する。とってもエモい。",
  enabled:true
},
{
  id:"SM0003",
  rarity:"SUPER_RARE",
  category:"ライブ",
  title:"えみつんはずっとヘドバンしたかった",
  text:"えみつんはずっと「Dreamin' Go! Go!!」のCメロ辺りでヘドバンしたかった。",
  relatedType:"song",
  relatedId:"S104",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
},
{
  id:"SM0004",
  rarity:"COMMON",
  category:"ユニット",
  title:"広州で突然誕生した新ユニット",
  text:"2025年11月のOverseas広州イベント発、μ'sの新ユニット「甜甜天使」が誕生！\n\nほのりんまきの新ユニットによる「Beat in Angel」を見逃すな！",
  relatedType:"song",
  relatedId:"S049",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
},
{
  id:"SM0005",
  rarity:"COMMON",
  category:"エピソード",
  title:"えみつんは「ぼららら」を手売りしていない",
  text:"「僕らのLIVE 君とのLIFE」発売当時、えみつんがコミケでCDを手売りしていた――という話は実は誤情報。本人によると、当時はただのお客さんとしてコミケを訪れていたそうです。",
  relatedType:"song",
  relatedId:"S001",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
},
{
  id:"SM0006",
  rarity:"COMMON",
  category:"エピソード",
  title:"「母つんが10枚購入」は実は違う",
  text:"「僕らのLIVE 君とのLIFE」を“母つんが10枚購入した”という話も実は誤情報。\nご両親から「家にも買ってきて」と渡された1万円に自分のお金を足し、10枚購入したのはえみつん本人でした。\n「うれしいもん！いっぱい買うさ！」",
  relatedType:"song",
  relatedId:"S001",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
},
{
  id:"SM0007",
  rarity:"SUPER_RARE",
  category:"イベント",
  title:"海外イベント開催のきっかけは、りっぴーのひと言",
  text:"Lovelive Overseas events開催のきっかけとなったのは、りっぴーの発言。\nその後海外でのイベントが展開され、りっぴー自身もソウル・広州公演に出演しました。",
  enabled:true
},
{
  id:"SM0008",
  rarity:"COMMON",
  category:"振付",
  title:"「お返事ください」に隠されたμ's",
  text:"「恋のシグナルRin rin rin!」の「お返事ください」の振り付けでは、頭の少し上あたりに指で「μ's」の文字をなぞっています。",
  relatedType:"song",
  relatedId:"S021",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
},
{
  id:"SM0009",
  rarity:"SUPER_RARE",
  category:"エピソード",
  title:"真姫ちゃんの「ゔぇえ」はこうして生まれた",
  text:"真姫ちゃんでおなじみの「ゔぇえ」。\nPileさんが声優として活動を始めたばかりで、アフレコに苦労していた頃に出た声から生まれました。",
  enabled:true
},
{
  id:"SM0010",
  rarity:"SUPER_RARE",
  category:"衣装",
  title:"あの羽を用意したのは実はPileさん",
  text:"Lovelive Overseas eventsのソウル・広州公演で披露された「Beat in Angel」。\nそのとき使われた衣装の羽を用意したのは、実はPileさんでした。",
  relatedType:"song",
  relatedId:"S049",
  linkLabel:"曲の歌唱履歴を見る",
  enabled:true
}
]);

export const SECRET_MEMORY_RARITY = Object.freeze({
  COMMON:{ label:"COMMON", weight:80 },
  SUPER_RARE:{ label:"SUPER RARE", weight:4 },
  LEGEND:{ label:"LEGEND", weight:1 }
});

export function drawSecretMemory(randomFn = Math.random) {
  const enabled = SECRET_MEMORY_DATA.filter(item => item.enabled);
  if (!enabled.length) return null;

  const rarities = Object.entries(SECRET_MEMORY_RARITY);
  const totalWeight = rarities.reduce((sum,[,config]) => sum + Number(config.weight || 0), 0);
  let position = randomFn() * totalWeight;
  let selectedRarity = rarities[0][0];

  for (const [rarity, config] of rarities) {
    position -= Number(config.weight || 0);
    if (position < 0) {
      selectedRarity = rarity;
      break;
    }
  }

  const candidates = enabled.filter(item => item.rarity === selectedRarity);
  const pool = candidates.length ? candidates : enabled;
  return pool[Math.floor(randomFn() * pool.length)] || null;
}
