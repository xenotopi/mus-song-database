"use strict";

// Runs in the capture page. Runtime SEO owns live-page metadata; the formal
// producer owns this final canonical and serializes in the same JS task, so
// the runtime helper's deferred callback cannot race the saved artifact.
function serializeCanonicalForCapture({ canonical }) {
  const expected = new URL(canonical);
  if (expected.origin !== "https://mus-song-db.com" || expected.href !== canonical ||
      !/^\/(?:song\/S\d{3}|release\/R\d{4})\.html$/.test(expected.pathname) || expected.search || expected.hash) {
    throw new Error("Invalid capture canonical URL");
  }
  const nodes = [...document.head.querySelectorAll("link")].filter(node =>
    node.rel.toLowerCase().split(/\s+/).includes("canonical"));
  if (nodes.length > 1) throw new Error("Duplicate capture canonical");
  if (nodes.length) {
    const node = nodes[0];
    if (node.rel !== "canonical" || node.href !== canonical) throw new Error("Unexpected capture canonical URL/rel");
    if ([...node.attributes].some(attr => !["rel", "href", "data-seo-dynamic"].includes(attr.name)) ||
        (node.hasAttribute("data-seo-dynamic") && node.getAttribute("data-seo-dynamic") !== "true")) {
      throw new Error("Unexpected capture canonical attributes");
    }
    node.remove();
  }
  const node = document.createElement("link");
  node.setAttribute("rel", "canonical");
  node.setAttribute("href", canonical);
  document.head.appendChild(node);
  if (!document.doctype || document.doctype.name.toLowerCase() !== "html" ||
      document.doctype.publicId || document.doctype.systemId || !document.documentElement) {
    throw new Error("Invalid capture document");
  }
  return new XMLSerializer().serializeToString(document.doctype) + document.documentElement.outerHTML;
}

module.exports = { serializeCanonicalForCapture };
