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
  title:"Dreamin' Go! Go!!",
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
  title:"甜甜天使",
  text:"2025年11月のOverseas広州イベント発、μ'sの新ユニット「甜甜天使」が誕生！\n\nほのりんまきの新ユニットによる「Beat in Angel」を見逃すな！",
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
