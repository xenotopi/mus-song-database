"use strict";

const a = require("node:assert/strict");
const { createHash } = require("node:crypto");
const reader = require("../../tools/static-html-readonly-lib.cjs");
const { parseSerializedHtml, descendants, textContent, hasClass, parseUniqueJson } = reader;
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const text = node => { a.ok(node, "Required document node missing"); return textContent(node).trim(); };
const children = node => node.children.filter(n => typeof n !== "string");

function identity(kind, id, data) {
  a.ok(kind === "release" || kind === "song", "Explicit document kind required");
  a.match(id, kind === "release" ? /^R\d{4}$/ : /^S\d{3}$/);
  a.equal(data[kind + "Id"], id, "Snapshot/document identity mismatch");
  return kind === "release" ? data.releaseName : data.displayName || data.songName;
}

function checkHead(doc, kind, id, data, canonicalOrigin) {
  const title = identity(kind, id, data);
  a.equal(doc.html.attrs["data-" + kind + "-id"], id, "Formal document identity");
  a.equal(doc.nodes.filter(n => n.tag === "h1").length, 1);
  a.equal(text(doc.ids.get(kind + "Name")), title, "Document title");
  const canon = doc.nodes.filter(n => n.tag === "link" && n.attrs.rel === "canonical");
  a.equal(canon.length, 1);
  a.equal(canon[0].attrs.href, new URL(`/${kind}/${id}.html`, canonicalOrigin).href, "Canonical URL mismatch");
  const robots = doc.nodes.filter(n => n.tag === "meta" && n.attrs.name === "robots");
  a.equal(robots.length, 1);
  a.equal(robots[0].attrs.content, "index,follow,max-image-preview:large");
  a.ok(doc.ids.has("mainContent"), "Protected mainContent required");
}

// validateBody is a separate, independent source-data validator, never a renderer.
function assertStaticDocument({ html, expectedHash, kind, id, data, origin, mode, documentType, canonicalOrigin, validateBody }) {
  a.match(expectedHash, /^[a-f0-9]{64}$/);
  a.equal(sha256(html), expectedHash, "HTTP original hash mismatch");
  assertModeOrigin(mode, origin);
  a.equal(typeof canonicalOrigin, "string", "Explicit canonical origin from approved baseline required");
  // Transport mode does not select the document contract. Never fall back to origin.
  a.ok(["fixture", "formal"].includes(documentType), "Explicit fixture/formal documentType required");
  assertModeOrigin(documentType === "fixture" ? "fixture" : "prod", canonicalOrigin);
  a.equal(Object.hasOwn(data, "expected"), documentType === "fixture", "Synthetic fixture/formal document contract mismatch");
  a.equal(typeof validateBody, "function", "Explicit static body validator required");
  const bytes = Buffer.from(html), source = bytes.toString("utf8");
  a.ok(Buffer.from(source).equals(bytes), "Original must be valid UTF-8");
  const doc = parseSerializedHtml(source);
  checkHead(doc, kind, id, data, canonicalOrigin);
  a.ok(!doc.nodes.some(n => hasClass(n, "detail-context-bar") || hasClass(n, "v46-detail-context") ||
    n.attrs.id === "songDetailContextV46" || Object.hasOwn(n.attrs, "data-release-cv")), "Runtime element persisted in static original");
  validateBody(doc);
  return doc;
}

function assertModeOrigin(mode, origin) {
  const url = new URL(origin);
  a.equal(url.origin, origin, "Origin must not contain path, credentials or query");
  if (mode === "prod") {
    a.equal(url.protocol, "https:", "PROD requires HTTPS");
    a.ok(!url.hostname.endsWith(".invalid") && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "PROD cannot use a fixture/loopback origin");
  }
  else if (mode === "localhost") {
    a.equal(url.protocol, "http:");
    a.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname), "Loopback origin required");
  } else {
    a.equal(mode, "fixture", "Explicit network contract required");
    a.ok(url.hostname.endsWith(".invalid"), "Fixture origin must use .invalid");
  }
}

function assertSingerEvidence(evidence, { mode, caseId }) {
  a.equal(evidence.mode, mode, "API network contract mismatch");
  a.equal(evidence.caseId, caseId, "API/case correspondence mismatch");
  a.equal(evidence.status, 200, "API source HTTP status");
  a.equal(sha256(evidence.body), evidence.sha256, "API original hash mismatch");
  const request = new URL(evidence.requestUrl), response = new URL(evidence.url);
  const chain = evidence.redirectChain || [];
  if (mode === "prod") {
    a.equal(evidence.mocked, false, "No PROD mock permitted");
    for (const url of [request, response, ...chain.map(x => new URL(x))]) {
      a.equal(url.protocol, "https:");
      a.match(url.hostname, /^script\.google(?:usercontent)?\.com$/);
    }
  } else if (mode === "localhost") {
    for (const url of [request, response, ...chain.map(x => new URL(x))]) assertModeOrigin(mode, url.origin);
  } else {
    a.equal(mode, "fixture");
    for (const url of [request, response, ...chain.map(x => new URL(x))]) assertModeOrigin(mode, url.origin);
  }
  a.equal(request.searchParams.get("action"), "singerList");
  const callback = request.searchParams.get("callback");
  a.match(callback || "", /^[A-Za-z_$][\w$]*$/);
  const body = evidence.body.trim().replace(/^\/\*\*\/\s*/, "");
  a.ok(body.startsWith(callback + "("), "JSONP callback mismatch");
  a.match(body, /\);?$/);
  const value = parseUniqueJson(body.slice(callback.length + 1, body.lastIndexOf(")")));
  a.equal(value.success, true);
  a.ok(Array.isArray(value.data?.official) && Array.isArray(value.data?.solo), "Singer source schema");
  return value.data;
}

// Independent ID/category/member/cast oracle retained from RECOVERY, without its lib/path dependencies.
function runtimePerson(release, master) {
  const featured = release.featuredSinger;
  if (!featured || !/^SN\d{4}$/.test(featured.id || "")) return null;
  const matches = (master?.official || []).filter(s => s.singerId === featured.id && s.category === "公式" && s.displayName === featured.name);
  if (matches.length !== 1) return null;
  const row = matches[0], person = { singerUrl: "singer.html?id=" + featured.id, cv: null, cvUrl: null };
  if (row.memberCount !== 1 || row.members?.length !== 1) return person;
  const member = row.members[0];
  if (!member.key || member.character !== featured.name || !String(member.cast || "").trim()) return person;
  person.cv = member.cast;
  const solo = (master.solo || []).filter(s => s.category === "ソロ" && /^SN\d{4}$/.test(s.singerId || "") &&
    s.memberCount === 1 && s.displayName === member.cast && s.members?.length === 1 &&
    s.members[0].key === member.key && s.members[0].character === member.character && s.members[0].cast === member.cast);
  if (solo.length === 1) person.cvUrl = "singer.html?id=" + solo[0].singerId;
  return person;
}

function checkBar(doc, kind, title) {
  const releaseBars = doc.nodes.filter(n => hasClass(n, "detail-context-bar"));
  const songBars = doc.nodes.filter(n => hasClass(n, "v46-detail-context") || n.attrs.id === "songDetailContextV46");
  const bars = kind === "release" ? releaseBars : songBars;
  a.equal((kind === "release" ? songBars : releaseBars).length, 0, "Song/Release component confusion");
  a.equal(bars.length, 1, "Exactly one runtime bar required");
  const bar = bars[0], prefix = kind === "release" ? "detail-context-" : "v46-detail-context-";
  a.equal(bar.parent.tag, "body");
  if (kind === "release") a.ok(Object.hasOwn(bar.attrs, "data-release-context"));
  else a.equal(bar.attrs.id, "songDetailContextV46");
  for (const [suffix, value] of [["type", kind === "release" ? "作品" : "曲"], ["title", title]]) {
    const nodes = descendants(bar, n => hasClass(n, prefix + suffix));
    a.equal(nodes.length, 1); a.equal(text(nodes[0]), value);
  }
  const buttons = descendants(bar, n => n.tag === "button" && hasClass(n, prefix + (kind === "release" ? "top-button" : "top")));
  a.equal(buttons.length, 1);
  a.equal(buttons[0].attrs["aria-label"], "ページ上部へ戻る");
  a.equal(descendants(bar, n => n.tag === "a" || n.tag === "script").length, 0);
}

function verifyEnrichment(doc, raw, data, master) {
  const info = doc.ids.get("releaseInfo"), oldInfo = raw.ids.get("releaseInfo");
  a.ok(info && oldInfo, "Release info required");
  const featured = descendants(info, n => Object.hasOwn(n.attrs, "data-release-featured"));
  const cvs = doc.nodes.filter(n => Object.hasOwn(n.attrs, "data-release-cv"));
  const person = runtimePerson(data, master), links = featured.flatMap(n => descendants(n, c => c.tag === "a"));
  if (person) {
    a.equal(featured.length, 1); a.equal(links.length, 1);
    const old = descendants(oldInfo, n => Object.hasOwn(n.attrs, "data-release-featured"));
    a.equal(old.length, 1);
    a.equal(text(links[0]), text(children(old[0]).find(n => n.tag === "dd")));
    a.deepEqual(Object.entries(links[0].attrs).sort(), Object.entries({ href: person.singerUrl, "aria-label": text(links[0]) + "の歌唱記録" }).sort());
    a.ok(links[0].children.every(n => typeof n === "string"));
  } else a.equal(links.length, 0, "No unverified featured link");
  a.equal(cvs.length, person?.cv ? 1 : 0, "No unverified CV");
  if (cvs.length) {
    const row = cvs[0];
    a.equal(row.parent, info);
    a.deepEqual(Object.entries(row.attrs).sort(), Object.entries({ "data-release-cv": "", "data-release-info-field": "cv", class: "release-info-row" }).sort());
    const pair = children(row); a.deepEqual(pair.map(n => n.tag), ["dt", "dd"]);
    a.equal(text(pair[0]), "CV"); a.equal(text(pair[1]), person.cv);
    const anchors = descendants(pair[1], n => n.tag === "a");
    a.deepEqual(anchors.map(n => n.attrs.href), person.cvUrl ? [person.cvUrl] : []);
    // Only plain text or the single independently verified anchor is accepted.
    a.ok(pair[0].children.every(n => typeof n === "string"));
    a.ok(pair[1].children.every(n => typeof n === "string" || anchors.includes(n)));
    for (const link of anchors) {
      a.deepEqual(Object.keys(link.attrs).sort(), ["aria-label", "href"]);
      a.equal(link.attrs["aria-label"], person.cv + "の歌唱記録");
      a.ok(link.children.every(n => typeof n === "string"));
    }
    a.equal(children(info).indexOf(row), children(info).indexOf(featured[0]) + 1);
  }
  return { person, cvNode: cvs[0] || null };
}

function assertRuntimeDocument(options) {
  const { rawHtml, rawHash, html, kind, id, data, origin, mode, documentType, canonicalOrigin, caseId, apiEvidence, validateStaticBody, validateRuntimeBody } = options;
  assertModeOrigin(mode, origin);
  const raw = assertStaticDocument({ html: rawHtml, expectedHash: rawHash, kind, id, data, origin, mode, documentType, canonicalOrigin, validateBody: validateStaticBody });
  a.equal(typeof validateRuntimeBody, "function", "Explicit runtime business validator required");
  const doc = parseSerializedHtml(html);
  checkHead(doc, kind, id, data, canonicalOrigin);
  checkBar(doc, kind, identity(kind, id, data));
  const master = apiEvidence ? assertSingerEvidence(apiEvidence, { mode, caseId }) : null;
  let person = null, cvNode = null;
  if (kind === "release") ({ person, cvNode } = verifyEnrichment(doc, raw, data, master));
  else a.equal(doc.nodes.filter(n => Object.hasOwn(n.attrs, "data-release-cv")).length, 0, "Release CV in Song");
  validateRuntimeBody(doc);
  // Read-only tree projection after independent checks; never modify a live DOM or feed it to the static validator.
  function normalized(node) {
    a.ok(node, "Protected node missing");
    return [node.tag, Object.entries(node.attrs).sort(), node.children.filter(c => c !== cvNode).map(c => {
      if (typeof c === "string") return c;
      if (person && c.tag === "dd" && Object.hasOwn(node.attrs, "data-release-featured")) return ["dd", Object.entries(c.attrs).sort(), [text(c)]];
      return normalized(c);
    })];
  }
  for (const region of ["mainContent", "heroMeta", kind === "release" ? "releaseSectionNav" : "songInfo"]) {
    if (raw.ids.has(region)) a.deepEqual(normalized(doc.ids.get(region)), normalized(raw.ids.get(region)), "Protected business DOM: " + region);
  }
  return { kind, id, contextBars: 1, protectedMainDOM: "MATCH", apiVerified: !!master, cv: person?.cv || null };
}

module.exports = { sha256, assertModeOrigin, assertStaticDocument, assertSingerEvidence, runtimePerson, assertRuntimeDocument };
