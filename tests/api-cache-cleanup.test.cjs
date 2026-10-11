"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../assets/js/api.js"), "utf8");
const LOCAL = "mus-db-local-v5.3.0:";
const LEGACY = "mus-db-local-v3.4.0:";
const SESSION = "mus-db-session-v5.3.0:";
const LIMIT = 4.2 * 1024 * 1024;
const TARGET = LIMIT * 0.8;
const NOW = 1800000000000;
const REVISION = `sha256-${"a".repeat(64)}`;

function stored(savedAt, padding = "", revision = REVISION) {
  return JSON.stringify({ savedAt, revision, response: { success: true, data: { padding, _cache: { revision } } } });
}

function storage(entries = []) {
  const values = new Map(entries);
  const calls = { key: 0, getItem: 0, setItem: 0, removeItem: 0 };
  const removed = [];
  const hooks = {};
  return {
    values, calls, removed, hooks,
    get length() { hooks.length?.(); return values.size; },
    key(index) { calls.key++; hooks.key?.(index); return [...values.keys()][index] ?? null; },
    getItem(key) { calls.getItem++; hooks.getItem?.(key); return values.get(key) ?? null; },
    setItem(key, value) { calls.setItem++; hooks.setItem?.(key, value); values.set(key, value); },
    removeItem(key) { calls.removeItem++; hooks.removeItem?.(key); values.delete(key); removed.push(key); }
  };
}

function harness(entries = []) {
  const local = storage(entries), session = storage(), warnings = [], requests = [];
  let blobs = 0;
  const network = { fail: false };
  const window = { setTimeout, clearTimeout };
  const document = {
    createElement() { return { parentNode: null }; },
    head: {
      appendChild(script) {
        script.parentNode = this;
        const url = new URL(script.src);
        requests.push(url.searchParams.get("action"));
        queueMicrotask(() => window[url.searchParams.get("callback")]?.(network.fail
          ? { success: false, error: { message: "offline" } }
          : { success: true, data: { dataRevision: REVISION, _cache: { revision: REVISION } } }));
      },
      removeChild(script) { script.parentNode = null; }
    }
  };
  const context = vm.createContext({
    localStorage: local, sessionStorage: session, window, document,
    Blob: class extends Blob { constructor(parts) { super(parts); blobs++; } },
    URL, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return NOW; } },
    console: { warn(...args) { warnings.push(args); } }
  });
  // Exercise the real module without adding test-only exports to production.
  vm.runInContext(source.replace(/\bexport /g, ""), context, { filename: "api.js" });
  return {
    local, session, warnings, requests, network,
    run(code) { return vm.runInContext(code, context); },
    get blobs() { return blobs; }
  };
}

function bytes(values) {
  return [...values].filter(([key]) => key.startsWith(LOCAL) || key.startsWith(LEGACY))
    .reduce((sum, [key, value]) => sum + new Blob([key, value || ""]).size, 0);
}

function largeEntries(count = 300) {
  return Array.from({ length: count }, (_, i) => [`${LOCAL}${i}`, stored(i + 1, "x".repeat(20750))]);
}

test("below limit: no deletion, one measurement per cache entry", () => {
  const h = harness([[`${LOCAL}small`, stored(1)], ["unrelated", "x".repeat(5000000)]]);
  h.run("removeOldLocalEntries()");
  assert.equal(h.local.removed.length, 0);
  assert.equal(h.local.calls.key, 2);
  assert.equal(h.local.calls.getItem, 1);
  assert.equal(h.blobs, 1);
});

test("over limit: stop at 80%, oldest first, and scan 300 entries only once", () => {
  const input = largeEntries().reverse();
  const h = harness(input);
  let expected = bytes(new Map(input));
  const removed = [];
  for (const [key, value] of input.slice().reverse()) {
    if (expected <= TARGET) break;
    removed.push(key); expected -= new Blob([key, value]).size;
  }
  h.run("removeOldLocalEntries()");
  assert.deepEqual(h.local.removed, removed);
  assert.equal(bytes(h.local.values), expected);
  assert.ok(expected <= TARGET);
  assert.equal(h.local.calls.key, 300);
  assert.equal(h.local.calls.getItem, 300);
  assert.equal(h.blobs, 300);
  assert.equal(h.local.calls.removeItem, removed.length);
});

test("Blob accounting includes key and UTF-8 values, including threshold boundaries", () => {
  const key = `${LOCAL}${"長".repeat(100)}`;
  // The value alone is below the limit; the authoritative key + value total is above it.
  const value = "あ".repeat(Math.floor((LIMIT - 100) / 3));
  assert.ok(new Blob([value]).size <= LIMIT);
  assert.ok(new Blob([key, value]).size > LIMIT);
  const h = harness([[key, value]]);
  h.run("removeOldLocalEntries()");
  assert.deepEqual(h.local.removed, [key]);
});

test("exactly at limit: no cleanup; at the 80% target: no extra removal", () => {
  const key = `${LOCAL}boundary`;
  const h = harness([[key, "x".repeat(Math.floor(LIMIT) - new Blob([key]).size)]]);
  h.run("removeOldLocalEntries()");
  assert.equal(h.local.removed.length, 0);
  const keep = `${LOCAL}keep`;
  const value = stored(2, "x".repeat(Math.floor(TARGET) - new Blob([keep, stored(2)]).size));
  const over = harness([[`${LOCAL}old`, stored(1, "x".repeat(1000000))], [keep, value]]);
  over.run("removeOldLocalEntries()");
  assert.deepEqual(over.local.removed, [`${LOCAL}old`]);
  assert.equal(over.local.values.get(keep), value);
});

test("current/legacy prefixes are counted; other storage and session entries are protected", () => {
  const h = harness([
    [`${LOCAL}new`, stored(20, "x".repeat(2300000))],
    [`${LEGACY}old`, stored(10, "x".repeat(2300000))],
    ["mus-db-local-unknown:keep", "x".repeat(5000000)],
    ["unrelated", "x".repeat(5000000)]
  ]);
  h.session.values.set(`${SESSION}keep`, "session");
  h.run("removeOldLocalEntries()");
  assert.deepEqual(h.local.removed, [`${LEGACY}old`]);
  assert.equal(h.local.values.size, 3);
  assert.equal(h.session.values.size, 1);
  assert.equal(h.local.calls.getItem, 2);
  assert.equal(h.blobs, 2);
});

test("invalid/missing cache metadata is oldest; equal savedAt keeps storage order", () => {
  const h = harness([
    [`${LOCAL}valid`, stored(8, "x".repeat(2000000))],
    [`${LOCAL}invalid`, "{broken" + "x".repeat(1300000)],
    [`${LEGACY}missing`, JSON.stringify({ response: {}, padding: "x".repeat(1300000) })],
    [`${LOCAL}empty`, ""]
  ]);
  h.run("removeOldLocalEntries()");
  assert.deepEqual(h.local.removed, [`${LOCAL}invalid`]);
  const tied = harness(largeEntries(3).map(([key]) => [key, stored(7, "x".repeat(1600000))]));
  tied.run("removeOldLocalEntries()");
  assert.deepEqual(tied.local.removed, [`${LOCAL}0`]);
});

test("null keys and cache values do not cause malformed storage failures", () => {
  const h = harness([[`${LOCAL}gone`, stored(1)], ["unrelated", "keep"]]);
  h.local.key = index => index === 0 ? `${LOCAL}gone` : null;
  h.local.getItem = () => null;
  assert.doesNotThrow(() => h.run("removeOldLocalEntries()"));
  assert.equal(h.warnings.length, 0);
  assert.equal(h.blobs, 1);
  assert.equal(h.local.removed.length, 0);
});

for (const method of ["length", "key", "getItem"]) {
  test(`storage ${method} exception: cleanup stops safely without deleting`, () => {
    const h = harness(largeEntries());
    h.local.hooks[method] = () => { throw Error("denied"); };
    assert.doesNotThrow(() => h.run("removeOldLocalEntries()"));
    assert.equal(h.local.removed.length, 0);
    assert.equal(h.warnings.length, 1);
  });
}

test("removeItem exception: no successful subtraction or subsequent deletion", () => {
  const h = harness(largeEntries());
  h.local.hooks.removeItem = () => { throw Error("denied"); };
  h.run("removeOldLocalEntries()");
  assert.equal(h.local.calls.removeItem, 1);
  assert.equal(h.local.removed.length, 0);
  assert.equal(h.local.values.size, 300);
  assert.ok(bytes(h.local.values) > LIMIT);
  delete h.local.hooks.removeItem;
  h.run("removeOldLocalEntries()");
  assert.ok(bytes(h.local.values) <= TARGET);
});

test("mid-cleanup deletion exception retains remaining entries and is retryable", () => {
  const h = harness(largeEntries());
  h.local.hooks.removeItem = () => { if (h.local.calls.removeItem === 2) throw Error("denied"); };
  h.run("removeOldLocalEntries()");
  assert.deepEqual(h.local.removed, [`${LOCAL}0`]);
  assert.equal(h.local.values.size, 299);
  delete h.local.hooks.removeItem;
  h.run("removeOldLocalEntries()");
  assert.ok(bytes(h.local.values) <= TARGET);
});

test("quota failure: existing cleanup and exactly one write retry are maintained", () => {
  const h = harness();
  h.local.hooks.setItem = () => {
    if (h.local.calls.setItem === 1) {
      for (const entry of largeEntries()) h.local.values.set(...entry);
      throw Error("QuotaExceededError");
    }
  };
  h.run(`writeCaches("song", {id:"S017"}, {success:true,data:{}}, "${REVISION}")`);
  assert.equal(h.local.calls.setItem, 2);
  assert.equal(h.session.calls.setItem, 1);
  assert.ok(h.local.removed.length > 0);
  assert.ok(bytes(h.local.values) <= TARGET + 500);
  assert.ok(h.local.values.has(`${LOCAL}revision:${REVISION}:song:{"id":"S017"}`));
});

test("persistent write failure retries once without throwing or changing session cache", () => {
  const h = harness();
  h.local.hooks.setItem = () => { throw Error("denied"); };
  assert.doesNotThrow(() => h.run(`writeCaches("song", {}, {success:true,data:{}}, "${REVISION}")`));
  assert.equal(h.local.calls.setItem, 2);
  assert.equal(h.session.calls.setItem, 1);
});

test("non-persistent search writes only session storage and never runs local cleanup", () => {
  const h = harness(largeEntries());
  h.run(`writeCaches("search", {q:"μ's"}, {success:true,data:{}}, "${REVISION}")`);
  assert.equal(h.session.calls.setItem, 1);
  assert.deepEqual(h.local.calls, { key: 0, getItem: 0, setItem: 0, removeItem: 0 });
  assert.equal(h.blobs, 0);
});

test("session write failure does not prevent the existing persistent cache write", () => {
  const h = harness();
  h.session.hooks.setItem = () => { throw Error("denied"); };
  assert.doesNotThrow(() => h.run(`writeCaches("song", {}, {success:true,data:{}}, "${REVISION}")`));
  assert.equal(h.local.calls.setItem, 1);
  assert.equal(h.session.calls.setItem, 1);
});

test("cleanup read/remove failures cannot break a successful API response", async () => {
  for (const method of ["getItem", "removeItem"]) {
    const h = harness(largeEntries());
    h.local.hooks[method] = () => { throw Error("denied"); };
    const response = await h.run('apiGet("song", {id:"S017"}, {forceRefresh:true,retryCount:0})');
    assert.equal(response.success, true);
    assert.equal(response.cache.source, "network");
    assert.equal(response.cache.revision, REVISION);
    assert.equal(h.local.removed.length, 0);
    assert.ok(h.session.values.size > 0);
  }
});

function cacheHarness(age, revision = REVISION) {
  const key = `${LOCAL}revision:${revision}:song:{"id":"S017"}`;
  const h = harness([[key, stored(NOW - age, "cached", revision)]]);
  h.session.values.set(`${SESSION}data-revision`, JSON.stringify({ revision: REVISION, fetchedAt: NOW }));
  return h;
}

test("fresh TTL cache and revision key still return local data without a network request", async () => {
  const h = cacheHarness(1000);
  const result = await h.run('apiGet("song", {id:"S017"})');
  assert.equal(result.cache.source, "local");
  assert.equal(result.cache.stale, false);
  assert.equal(result.cache.revision, REVISION);
  assert.equal(result.data.padding, "cached");
  assert.equal(h.requests.length, 0);
});

test("expired fresh TTL still uses stale-while-revalidate and caches the refreshed revision", async () => {
  const h = cacheHarness(31 * 60 * 1000);
  const result = await h.run('apiGet("song", {id:"S017"})');
  assert.equal(result.cache.stale, true);
  assert.equal(result.cache.source, "local");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(h.requests, ["song"]);
  assert.equal(h.local.calls.setItem, 1);
});

test("revision-mismatched cache remains a bounded stale fallback on network failure", async () => {
  const oldRevision = `sha256-${"b".repeat(64)}`;
  const h = cacheHarness(1000, oldRevision);
  h.network.fail = true;
  const result = await h.run('apiGet("song", {id:"S017"}, {retryCount:0,staleWhileRevalidate:false})');
  assert.equal(result.cache.fallback, true);
  assert.equal(result.cache.revisionFallback, true);
  assert.equal(result.cache.revision, oldRevision);
  assert.equal(result.data.padding, "cached");
});

test("stale TTL expiration and forceRefresh still reject network failures", async () => {
  for (const [age, options] of [[8 * 24 * 60 * 60 * 1000, ""], [1000, ",forceRefresh:true"]]) {
    const h = cacheHarness(age);
    h.network.fail = true;
    await assert.rejects(h.run(`apiGet("song", {id:"S017"}, {retryCount:0${options}})`), /offline/);
  }
});
