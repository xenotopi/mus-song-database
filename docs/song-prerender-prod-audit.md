# Song static HTML rollout — local pre-production audit

2026-10-06. No commit, push, deployment, or current/snapshot mutation in this step.

## Output and URL policy

- 117 Song pages: `/song/S001.html` through `/song/S117.html`.
- Source: existing `sha256-caf2d998618089b07d155f23f8879331c405369a0c5a19c9dc150f676043389f` snapshots.
- Generation uses the existing Song renderer with external networking blocked. No live API fetches.
- Raw HTML includes Song h1/ID, basic/release information, performance statistics, first/last dates, existing decoration, unique description, and initial history rows.
- One self-canonical and unique title/description/OG metadata per page. Shared OG image unchanged. No structured data added.
- Discover remains a browser-side API feature.
- Sitemap: 241 URLs, including 117 new Song paths. No old Song query URLs or share URLs.
- Song share pages: all 117 canonical/redirect/fallback URLs use the new paths; SNS raw metadata and noindex,follow remain unchanged. Event share pages are unchanged.
- Legacy `song.html?id=Sxxx` remains available and uses `location.replace` for valid existing IDs, preserves fragments, and drops transient queries. Canonical points to the new path. No HTTP 301 claim and no added noindex: canonical and client redirect provide the consolidation signals.

## Generator integration and validation

`generate-song-pages.cjs` is called by both normal snapshot generation and formal current switching, before the current pointer is written. Missing source/generation failures do not switch current.

HTML build metadata and file SHA-256 values live in `song/manifest.json`, separately from immutable API snapshot manifests. It records output/data revision, all 117 file hashes, bytes, canonical URLs, and a template/renderer/assets fingerprint. Existing snapshot generations are not overwritten.

All 117 files are parsed and checked against snapshots for ID, h1, title, description, canonical, OG URL, unique canonical, and file hash. Representative raw hashes are recorded in the build manifest.

Representative S001/S003/S117: JS OFF/ON at 1280px/390px, no double rendering, overflow, or page/console errors. Static-first does not issue Song detail API requests when current snapshots are usable. Real Discover QA covers navigation, the 117-song picker, and actual picker/next-link navigation.

Regression covers Home/Search/Member Analytics/Song filters and Event/Singer/Release-to-Song navigation. The older broad Song/Release test invocation was stopped because its revision mock forces network-dependent refreshes; the independent snapshot-based link regression covers this migration without changing unrelated fixture expectations.

Final results: local regression 59/59 PASS; real Discover/navigation QA 6/6 PASS; sitemap snapshot check PASS; share generator check PASS; git diff --check PASS. The latest 117-page generation took 49.7 seconds and produced 11,571,041 HTML bytes (excluding the build manifest).

## Exact change inventory

Generated:
- `song/S001.html` … `song/S117.html` (117 new pages)
- `song/manifest.json`
- `share/song/S001.html` … `share/song/S117.html` (117 updated pages)
- `sitemap.xml`

HTML/template/asset-version references:
- `song.html` (legacy bridge and template)
- `search.html` (result URL helper and asset references)
- `404.html`, `about.html`, `event.html`, `gap-checker.html`, `index.html`, `member-analytics.html`, `rankings.html`, `release.html`, `singer.html`, `songs.html`, `statistics.html`, `venue.html` (required asset cache invalidation only)

JavaScript:
- `assets/js/api.js` (shared buildSongUrl)
- `assets/js/common.js`
- `assets/js/home-v453.js`
- `assets/js/event-v310.js`
- `assets/js/singer-v460.js`
- `assets/js/release-v500.js`
- `assets/js/song-v441.js`
- `assets/js/songs-v470.js`
- `assets/js/member-analytics.js`
- `assets/js/rankings-v421.js`
- `assets/js/statistics-v470.js`
- `assets/js/venue-v300.js`
- `assets/js/gap-checker-v490.js`
- `assets/js/seo-v351.js`

Tools:
- `tools/generate-song-pages.cjs` (production version of the preceding PoC generator)
- `tools/generate-static-snapshot.cjs`
- `tools/generate-share-pages.cjs`
- `tools/generate-sitemap.cjs` (also supports snapshot-only generation/check)

Tests:
- `tests/song-prerender-poc.test.cjs`
- `tests/seo-indexing.test.cjs`
- `tests/share-ogp.test.cjs`
- `tests/share-ogp-all.test.cjs`
- `tests/song-release-link.test.cjs` (new canonical expectation only)
- `tests/search-release-ui.test.cjs`
- `tests/member-analytics-ui.test.cjs`
- `tests/song-view-group-filter-ui.test.cjs`

Audit:
- `docs/song-prerender-prod-audit.md`

Unrelated card/catalog/renderer changes, `data/event-static-preview`, existing uncommitted current/new generation, and prior card tool folders are preserved and excluded from this change inventory. Browser QA screenshots remain local test artifacts, not deployment assets.
