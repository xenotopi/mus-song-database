"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const WIDTH = 1080;
const HEIGHT = 1350;

function loadPlaywright() {
  try {
    return require("playwright");
  } catch (localError) {
    const bundledPath = path.join(
      os.homedir(), ".cache", "codex-runtimes", "codex-primary-runtime",
      "dependencies", "node", "node_modules", "playwright"
    );
    try {
      return require(bundledPath);
    } catch (bundledError) {
      throw new Error("Playwrightが見つかりません。各テンプレートで `npm install` を実行してください。", { cause: localError });
    }
  }
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const part = argv[index];
    if (!part.startsWith("--")) continue;
    const equalAt = part.indexOf("=");
    if (equalAt !== -1) {
      options[part.slice(2, equalAt)] = part.slice(equalAt + 1);
      continue;
    }
    const key = part.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
    } else {
      options[key] = "true";
    }
  }
  return options;
}

function findBrowserExecutable(chromium) {
  const candidates = [
    chromium.executablePath(),
    process.env.PROGRAMFILES && path.join(process.env.PROGRAMFILES, "Google", "Chrome", "Application", "chrome.exe"),
    process.env["PROGRAMFILES(X86)"] && path.join(process.env["PROGRAMFILES(X86)"], "Microsoft", "Edge", "Application", "msedge.exe")
  ].filter(Boolean);
  const executablePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!executablePath) {
    throw new Error("Chromium系ブラウザが見つかりません。`npx playwright install chromium` を実行してください。");
  }
  return executablePath;
}

function readPngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("生成物がPNG形式ではありません。");
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

async function renderCard({ templateDir, values, outputPath }) {
  const pageUrl = pathToFileURL(path.join(templateDir, "index.html"));
  Object.entries(values).forEach(([key, value]) => pageUrl.searchParams.set(key, value));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  const { chromium } = loadPlaywright();
  const browser = await chromium.launch({ headless: true, executablePath: findBrowserExecutable(chromium) });
  try {
    const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(pageUrl.href, { waitUntil: "load" });
    await page.waitForFunction(() => document.documentElement.dataset.ready === "true");
    if (pageErrors.length > 0) throw new Error(`ページ描画エラー: ${pageErrors.join(" / ")}`);

    const layout = await page.evaluate(() => {
      const overflows = [...document.querySelectorAll(".fit-text")]
        .filter((element) => element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 4)
        .map((element) => ({
          id: element.id,
          client: [element.clientWidth, element.clientHeight],
          scroll: [element.scrollWidth, element.scrollHeight],
          fontSize: getComputedStyle(element).fontSize
        }));
      return {
        pageOverflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight,
        overflows
      };
    });
    if (layout.pageOverflow || layout.overflows.length > 0) {
      throw new Error(`カード内に文字切れまたはoverflowがあります: ${JSON.stringify(layout)}`);
    }
    await page.screenshot({ path: outputPath, type: "png", clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT } });
  } finally {
    await browser.close();
  }

  const dimensions = readPngDimensions(outputPath);
  if (dimensions.width !== WIDTH || dimensions.height !== HEIGHT) {
    throw new Error(`PNG寸法が不正です: ${dimensions.width}x${dimensions.height}`);
  }
  process.stdout.write(`${outputPath}\n${dimensions.width}x${dimensions.height}\n`);
}

module.exports = { HEIGHT, WIDTH, parseArguments, renderCard };
