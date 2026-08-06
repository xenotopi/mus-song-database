export const BIRTHDAY_DATA = Object.freeze([
{ id:"BD-C001",type:"character",name:"高坂穂乃果",month:8,day:3,suffix:"ちゃん" },
{ id:"BD-C002",type:"character",name:"絢瀬絵里",month:10,day:21,suffix:"ちゃん" },
{ id:"BD-C003",type:"character",name:"南ことり",month:9,day:12,suffix:"ちゃん" },
{ id:"BD-C004",type:"character",name:"園田海未",month:3,day:15,suffix:"ちゃん" },
{ id:"BD-C005",type:"character",name:"星空凛",month:11,day:1,suffix:"ちゃん" },
{ id:"BD-C006",type:"character",name:"西木野真姫",month:4,day:19,suffix:"ちゃん" },
{ id:"BD-C007",type:"character",name:"東條希",month:6,day:9,suffix:"ちゃん" },
{ id:"BD-C008",type:"character",name:"小泉花陽",month:1,day:17,suffix:"ちゃん" },
{ id:"BD-C009",type:"character",name:"矢澤にこ",month:7,day:22,suffix:"ちゃん" },
{ id:"BD-A001",type:"cast",name:"新田恵海",month:12,day:10,suffix:"さん" },
{ id:"BD-A002",type:"cast",name:"南條愛乃",month:7,day:12,suffix:"さん" },
{ id:"BD-A003",type:"cast",name:"内田彩",month:7,day:23,suffix:"さん" },
{ id:"BD-A004",type:"cast",name:"三森すずこ",month:6,day:28,suffix:"さん" },
{ id:"BD-A005",type:"cast",name:"飯田里穂",month:10,day:26,suffix:"さん" },
{ id:"BD-A006",type:"cast",name:"Pile",month:5,day:2,suffix:"さん" },
{ id:"BD-A007",type:"cast",name:"楠田亜衣奈",month:2,day:1,suffix:"さん" },
{ id:"BD-A008",type:"cast",name:"久保ユリカ",month:5,day:19,suffix:"さん" },
{ id:"BD-A009",type:"cast",name:"徳井青空",month:12,day:26,suffix:"さん" }
]);

export function getBirthdaysForDate(date = new Date()) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  return BIRTHDAY_DATA.filter(item => item.month === month && item.day === day);
}
