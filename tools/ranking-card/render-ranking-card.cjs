"use strict";

const path = require("node:path");
const { parseArguments, renderCard } = require("../card-shared/render-card.cjs");

const PRESETS = Object.freeze({
  X0010: Object.freeze({
    title: "公式歌唱数ランキング",
    label: "DATABASE RANKING",
    unit: "回",
    rows: [
      { rank: 1, name: "ミはμ'sicのミ", value: 53 },
      { rank: 2, name: "Snow halation", value: 51 },
      { rank: 3, name: "僕らは今のなかで", value: 48 },
      { rank: 4, name: "僕らのLIVE 君とのLIFE", value: 46 },
      { rank: 5, name: "No brand girls", value: 35 }
    ]
  })
});

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const id = args.id || "X0010";
  const preset = PRESETS[id] || PRESETS.X0010;
  const values = {
    id,
    title: args.title || preset.title,
    label: args.label || preset.label,
    unit: args.unit || preset.unit,
    rows: args.rows || JSON.stringify(preset.rows)
  };
  const outputPath = path.resolve(
    args.output || path.join(__dirname, "..", "..", "outputs", `ranking-card-${id}.png`)
  );
  await renderCard({ templateDir: __dirname, values, outputPath });
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
