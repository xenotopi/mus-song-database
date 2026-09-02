"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { parseArguments } = require("./card-shared/render-card.cjs");

const DEFAULT_CATALOG = path.join(__dirname, "post-card-catalog.json");
const ALLOWED_ARGUMENTS = new Set(["id", "category", "event", "song", "venue", "catalog", "render", "output"]);
const REFERENCE_FIELDS = Object.freeze({
  event: { key: "eventId", pattern: /^EV\d{4}$/ },
  song: { key: "songId", pattern: /^S\d{3}$/ },
  venue: { key: "venueId", pattern: /^VE\d{4}$/ }
});

function normalize(value) {
  return String(value ?? "").trim().toUpperCase();
}

function loadCatalog(filePath) {
  const catalog = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!catalog || typeof catalog.posts !== "object" || Array.isArray(catalog.posts)) {
    throw new Error("投稿カードカタログの形式が不正です。");
  }
  return catalog;
}

function writeCatalog(filePath, catalog) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
  try {
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function main() {
  const args = parseArguments(process.argv.slice(2));
  const unknown = Object.keys(args).filter((key) => !ALLOWED_ARGUMENTS.has(key));
  if (unknown.length > 0) throw new Error(`未対応の引数です: ${unknown.map((key) => `--${key}`).join(", ")}`);

  const id = normalize(args.id);
  if (!/^X\d{4}$/.test(id)) throw new Error("投稿IDを `--id X0011` の形式で指定してください。");
  const catalogPath = path.resolve(args.catalog || DEFAULT_CATALOG);
  const catalog = loadCatalog(catalogPath);
  const existing = catalog.posts[id] || {};
  const post = { ...existing };

  if (Object.hasOwn(args, "category")) {
    const categoryId = normalize(args.category);
    if (!/^X\d{2}$/.test(categoryId)) throw new Error("カテゴリIDを `--category X01` の形式で指定してください。");
    post.categoryId = categoryId;
  }
  if (!post.categoryId) throw new Error(`${id}: 新規登録には --category が必要です。`);

  Object.entries(REFERENCE_FIELDS).forEach(([argument, definition]) => {
    if (!Object.hasOwn(args, argument)) return;
    const value = normalize(args[argument]);
    if (value === "") {
      delete post[definition.key];
      return;
    }
    if (!definition.pattern.test(value)) {
      throw new Error(`${argument} IDの形式が不正です: ${value}`);
    }
    post[definition.key] = value;
  });

  catalog.posts[id] = post;
  writeCatalog(catalogPath, catalog);
  process.stdout.write(`${id}を${path.basename(catalogPath)}へ登録しました。\n`);

  if (args.render === "true") {
    const renderScript = path.join(__dirname, "render-post-card.cjs");
    const renderArguments = [renderScript, "--id", id, "--catalog", catalogPath];
    if (args.output) renderArguments.push("--output", path.resolve(args.output));
    const result = spawnSync(process.execPath, renderArguments, { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status || 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
