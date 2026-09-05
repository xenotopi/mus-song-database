"use strict";

const path = require("node:path");
const { parseArguments, renderCard } = require("../card-shared/render-card.cjs");

const PRESETS = Object.freeze({
  X0009: Object.freeze({
    date: "2013年9月1日",
    event: "みもパ！vol.1 第2回",
    song: "ダイヤモンドプリンセスの憂鬱",
    singer: "三森すずこ",
    category: "声優ソロ系",
    note: "ショートVer."
  })
});

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const id = args.id || "X0009";
  const preset = PRESETS[id] || PRESETS.X0009;
  const values = { id };
  Object.keys(preset).forEach((key) => {
    values[key] = args[key] || (key === "category" ? args.type : "") || preset[key];
  });
  const outputPath = path.resolve(
    args.output || path.join(__dirname, "..", "..", "outputs", `today-card-${id}.png`)
  );
  await renderCard({ templateDir: __dirname, values, outputPath });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
