"use strict";

// Strict readers for browser-serialized HTML/JSON, not a browser or sanitizer.
// Unsupported/malformed serialization is rejected rather than repaired. Nothing
// is executed, fetched, captured, or written. Keep this independent of rendering.
function requireCondition(ok, message) {
  if (!ok) throw new Error(message);
}

function parseUniqueJson(raw) {
  const value = JSON.parse(raw);
  const tokens = raw.match(/"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g) || [];
  let index = 0;
  function consume() {
    const token = tokens[index++];
    if (token === "{") {
      const keys = new Set();
      if (tokens[index] === "}") { index++; return; }
      do {
        const key = JSON.parse(tokens[index++]);
        requireCondition(!keys.has(key), `Duplicate JSON key: ${key}`);
        keys.add(key);
        requireCondition(tokens[index++] === ":", "Invalid JSON object");
        consume();
      } while (tokens[index++] === ",");
      requireCondition(tokens[index - 1] === "}", "Invalid JSON object terminator");
    } else if (token === "[") {
      if (tokens[index] === "]") { index++; return; }
      do { consume(); } while (tokens[index++] === ",");
      requireCondition(tokens[index - 1] === "]", "Invalid JSON array terminator");
    }
  }
  consume();
  requireCondition(index === tokens.length, "Invalid JSON token stream");
  return value;
}

function decodeText(text) {
  const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (_, entity) => {
    if (entity[0] === "#") {
      const n = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      requireCondition(n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff), "Invalid HTML character reference");
      return String.fromCodePoint(n);
    }
    requireCondition(Object.hasOwn(named, entity), `Unsupported serialized HTML entity: ${entity}`);
    return named[entity];
  });
}

function parseSerializedHtml(raw) {
  const document = { tag: "#document", attrs: {}, children: [], parent: null };
  const stack = [document], nodes = [], ids = new Map();
  const voidTags = new Set("area base br col embed hr img input link meta param source track wbr".split(" "));
  let offset = 0, doctypes = 0;
  while (offset < raw.length) {
    if (raw.startsWith("<!--", offset)) {
      const end = raw.indexOf("-->", offset + 4);
      requireCondition(end >= 0, "Unterminated HTML comment"); offset = end + 3; continue;
    }
    if (/^<!doctype html>/i.test(raw.slice(offset, offset + 15))) {
      requireCondition(stack.length === 1 && ++doctypes === 1, "Invalid HTML doctype"); offset += 15; continue;
    }
    if (raw[offset] !== "<") {
      let end = raw.indexOf("<", offset); if (end < 0) end = raw.length;
      stack.at(-1).children.push(decodeText(raw.slice(offset, end))); offset = end; continue;
    }
    const closing = /^<\/([\w:-]+)\s*>/.exec(raw.slice(offset));
    if (closing) {
      requireCondition(stack.length > 1 && stack.at(-1).tag === closing[1].toLowerCase(), `Unbalanced HTML closing tag: ${closing[1]}`);
      stack.pop(); offset += closing[0].length; continue;
    }
    const opening = /^<([a-z][\w:-]*)(?=[\s/>])/i.exec(raw.slice(offset));
    requireCondition(opening, "Invalid serialized HTML tag");
    const tag = opening[1].toLowerCase(), attrs = Object.create(null);
    offset += opening[0].length;
    while (true) {
      const whitespace = /^\s*/.exec(raw.slice(offset))[0]; offset += whitespace.length;
      if (raw[offset] === ">" || raw.startsWith("/>", offset)) break;
      requireCondition(whitespace.length > 0, `Missing attribute separator: ${tag}`);
      const attribute = /^([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/.exec(raw.slice(offset));
      requireCondition(attribute, `Invalid HTML attribute: ${tag}`);
      const name = attribute[1].toLowerCase();
      requireCondition(!Object.hasOwn(attrs, name), `Duplicate HTML attribute: ${name}`);
      attrs[name] = decodeText(attribute[2] ?? attribute[3] ?? attribute[4] ?? ""); offset += attribute[0].length;
    }
    const selfClosing = raw.startsWith("/>", offset); offset += selfClosing ? 2 : 1;
    requireCondition(!selfClosing || voidTags.has(tag) || tag === "svg" || tag === "math" || stack.some(n => n.tag === "svg" || n.tag === "math"), "Unsupported self-closing HTML element");
    const node = { tag, attrs, children: [], parent: stack.at(-1) };
    node.parent.children.push(node); nodes.push(node);
    if (Object.hasOwn(attrs, "id")) {
      requireCondition(attrs.id && !ids.has(attrs.id), `Duplicate/empty HTML ID: ${attrs.id}`); ids.set(attrs.id, node);
    }
    if (tag === "script" || tag === "style") {
      const end = raw.toLowerCase().indexOf(`</${tag}>`, offset);
      requireCondition(end >= 0 && !selfClosing, `Unterminated raw-text element: ${tag}`);
      node.children.push(raw.slice(offset, end)); offset = end + tag.length + 3;
    } else if (!voidTags.has(tag) && !selfClosing) stack.push(node);
  }
  requireCondition(stack.length === 1 && doctypes === 1, "Incomplete serialized HTML document");
  const roots = document.children.filter(n => typeof n !== "string");
  requireCondition(roots.length === 1 && roots[0].tag === "html", "HTML root missing/duplicated");
  requireCondition(roots[0].children.filter(n => n.tag === "head").length === 1 && roots[0].children.filter(n => n.tag === "body").length === 1, "HTML head/body missing/duplicated");
  return { document, nodes, ids, html: roots[0] };
}

function descendants(node, predicate) {
  const result = [];
  for (const child of node.children) if (typeof child !== "string") {
    if (predicate(child)) result.push(child);
    result.push(...descendants(child, predicate));
  }
  return result;
}
function textContent(node) { return node.children.map(n => typeof n === "string" ? n : textContent(n)).join(""); }
function visible(node) {
  for (let n = node; n; n = n.parent) {
    if (Object.hasOwn(n.attrs, "hidden") || n.attrs["aria-hidden"] === "true" || /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(n.attrs.style || "")) return false;
  }
  return true;
}
function hasClass(node, name) { return (node.attrs.class || "").split(/\s+/).includes(name); }

module.exports = { parseUniqueJson, parseSerializedHtml, descendants, textContent, visible, hasClass, requireCondition };
