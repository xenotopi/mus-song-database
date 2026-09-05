"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { parseArguments, renderCard } = require("../card-shared/render-card.cjs");

async function main() {
  const args = parseArguments(process.argv.slice(2));
  if (!args.input) throw new Error("--input JSONファイルを指定してください");
  const values = JSON.parse(fs.readFileSync(path.resolve(args.input), "utf8"));
  const variant = args.variant || "B";
  if (!["A", "B"].includes(variant)) throw new Error("--variantはAまたはBです");
  await renderCard({
    templateDir: __dirname,
    values: { ...values, variant, cake: args.cake || "true" },
    outputPath: path.resolve(args.output || path.join(__dirname, "../../outputs", `birthday-card-${variant}.png`))
  });
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
