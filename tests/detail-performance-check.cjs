const { chromium } = require("playwright");

const baseUrl = process.env.MUSDB_PERF_BASE_URL || "https://xenotopi.github.io/mus-song-database";
const iterations = Math.max(1, Number(process.env.MUSDB_PERF_ITERATIONS || 5));
const executablePath = process.env.MUSDB_E2E_BROWSER_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const cases = [
  ["R0088", "release.html?id=R0088", "#mainContent:not([hidden])"],
  ["R0106", "release.html?id=R0106", "#mainContent:not([hidden])"],
  ["S100", "song.html?id=S100", "#mainContent:not([hidden])"],
  ["S003", "song.html?id=S003", "#mainContent:not([hidden])"],
  ["S046", "song.html?id=S046", "#mainContent:not([hidden])"]
];

const round = value => Math.round(Number(value || 0) * 1000) / 1000;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

async function measure(page, path) {
  await page.addInitScript(() => {
    window.__musdbCls = 0;
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__musdbCls += entry.value;
    }).observe({ type: "layout-shift", buffered: true });
  });
  const started = Date.now();
  await page.goto(`${baseUrl}/${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
  const selector = path.startsWith("release") ? "#mainContent:not([hidden])" : "#mainContent:not([hidden])";
  await page.waitForSelector(selector, { timeout: 45000 });
  const mainMs = Date.now() - started;
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const resources = performance.getEntriesByType("resource").map(entry => ({ name: entry.name, start: entry.startTime, duration: entry.duration }));
    const api = resources.filter(entry => /script\.google\.com|script\.googleusercontent\.com/.test(entry.name));
    return {
      cls: window.__musdbCls || 0,
      nodes: document.getElementsByTagName("*").length,
      api: api.map(entry => ({ start: entry.start, duration: entry.duration, action: new URL(entry.name).searchParams.get("action") || "" })),
      relationRows: document.querySelectorAll(".release-included-song-row,.included-release-row").length,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
  return { mainMs, fullMs: Date.now() - started, ...metrics };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath });
  const output = {};
  try {
    for (const [name, path] of cases) {
      output[name] = { cold: [], warm: [] };
      for (let i = 0; i < iterations; i += 1) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        output[name].cold.push(await measure(page, path));
        output[name].warm.push(await measure(page, path));
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
  const summary = Object.fromEntries(Object.entries(output).map(([name, modes]) => [name, Object.fromEntries(Object.entries(modes).map(([mode, rows]) => [mode, {
    mainMs: median(rows.map(row => row.mainMs)),
    fullMs: median(rows.map(row => row.fullMs)),
    cls: round(median(rows.map(row => row.cls))),
    nodes: median(rows.map(row => row.nodes)),
    relationRows: median(rows.map(row => row.relationRows)),
    horizontalOverflow: rows.some(row => row.horizontalOverflow),
    samples: rows
  }]))]));
  process.stdout.write(`${JSON.stringify({ baseUrl, iterations, summary }, null, 2)}\n`);
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
