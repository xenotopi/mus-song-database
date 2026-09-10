"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..");
const apiSource = fs.readFileSync(path.join(ROOT, "assets/js/api.js"), "utf8");
const commonSource = fs.readFileSync(path.join(ROOT, "assets/js/common.js"), "utf8");

function lifecycleSource() {
  const start = apiSource.indexOf("export function jsonpRequest");
  const end = apiSource.indexOf("\n\nfunction readStoredDataRevision", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  return [
    'const API_URL = "https://example.test/exec";',
    "const DEFAULT_TIMEOUT_MS = 15000;",
    "const JSONP_LATE_CALLBACK_TTL_MS = 60000;",
    "let requestSequence = 0;",
    apiSource.slice(start, end).replace("export function", "function"),
    "globalThis.__exports = { jsonpRequest, requestWithRetry };"
  ].join("\n");
}

function createHarness() {
  let nextTimerId = 1;
  const timers = new Map();
  const scripts = [];
  const window = {
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    }
  };
  const document = {
    createElement() {
      const script = { parentNode: null, async: false, src: "", onerror: null };
      scripts.push(script);
      return script;
    },
    head: {
      appendChild(script) {
        script.parentNode = this;
      },
      removeChild(script) {
        script.parentNode = null;
      }
    }
  };
  const context = vm.createContext({
    URL,
    window,
    document,
    clearTimeout(id) { timers.delete(id); },
    setTimeout(callback) { callback(); },
    Error,
    Promise,
    String,
    Object
  });
  vm.runInContext(lifecycleSource(), context, { filename: "api-jsonp-lifecycle.js" });
  return {
    ...context.__exports,
    window,
    scripts,
    timers,
    callbackName(index = scripts.length - 1) {
      return new URL(scripts[index].src).searchParams.get("callback");
    },
    runTimer(delay) {
      const entry = [...timers.entries()].find(([, timer]) => timer.delay === delay);
      assert.ok(entry, `timer ${delay}ms`);
      timers.delete(entry[0]);
      entry[1].callback();
    }
  };
}

test("JSONP fast success keeps the existing success contract", async () => {
  const harness = createHarness();
  const request = harness.jsonpRequest({ action: "search", params: { q: "映画BD" }, timeoutMs: 10 });
  const callbackName = harness.callbackName();
  harness.window[callbackName]({ success: true, data: { query: "映画BD" } });
  assert.equal((await request.promise).data.query, "映画BD");
  assert.equal(harness.window[callbackName], undefined);
  assert.equal(harness.scripts[0].parentNode, null);
});

test("timeout rejects, safely discards a late response, and later removes the noop", async () => {
  const harness = createHarness();
  const request = harness.jsonpRequest({ action: "search", params: { q: "映画BD" }, timeoutMs: 10 });
  const callbackName = harness.callbackName();
  harness.runTimer(10);
  await assert.rejects(request.promise, /タイムアウト/);
  const lateCallback = harness.window[callbackName];
  assert.equal(typeof lateCallback, "function");
  assert.doesNotThrow(() => lateCallback({ success: true, data: { query: "late" } }));
  assert.equal(harness.scripts[0].parentNode, null);
  harness.runTimer(60000);
  assert.equal(harness.window[callbackName], undefined);
});

test("cancel and script error also retain only a temporary noop", async () => {
  for (const mode of ["cancel", "error"]) {
    const harness = createHarness();
    const request = harness.jsonpRequest({ action: "search", timeoutMs: 10 });
    const callbackName = harness.callbackName();
    if (mode === "cancel") {
      request.cancel();
    } else {
      harness.scripts[0].onerror();
      await assert.rejects(request.promise, /読み込めませんでした/);
    }
    assert.equal(typeof harness.window[callbackName], "function");
    harness.runTimer(60000);
    assert.equal(harness.window[callbackName], undefined);
  }
});

test("retry uses a distinct callback and ignores the first request's late response", async () => {
  const harness = createHarness();
  const promise = harness.requestWithRetry("search", { q: "映画BD" }, { timeoutMs: 10, retryCount: 1 });
  const firstCallbackName = harness.callbackName(0);
  harness.runTimer(10);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(harness.scripts.length, 2);
  const secondCallbackName = harness.callbackName(1);
  assert.notEqual(firstCallbackName, secondCallbackName);
  harness.window[secondCallbackName]({ success: true, data: { query: "映画BD" } });
  assert.equal((await promise).data.query, "映画BD");
  assert.doesNotThrow(() => harness.window[firstCallbackName]({ success: true, data: { query: "late" } }));
});

test("two timed-out attempts stop after the configured retry", async () => {
  const harness = createHarness();
  const promise = harness.requestWithRetry("search", { q: "映画BD" }, { timeoutMs: 10, retryCount: 1 });
  harness.runTimer(10);
  await new Promise(resolve => setImmediate(resolve));
  harness.runTimer(10);
  await assert.rejects(promise, /タイムアウト/);
  assert.equal(harness.scripts.length, 2);
});

test("Header keeps request guards and uses the shared 15-second retry contract", () => {
  assert.match(commonSource, /timeoutMs:\s*15000,\s*retryCount:\s*1/);
  assert.match(commonSource, /currentRequestId\s*!==\s*requestId/);
  assert.match(commonSource, /window\.setTimeout\(\s*requestSuggestions,\s*260/);
});
