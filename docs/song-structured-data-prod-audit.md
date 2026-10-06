# Song structured data full rollout — local QA

- Generated 117 pages via normal `node tools/generate-song-pages.cjs`, 49.9s, no API requests.
- Each raw head has exactly one MusicRecording and one BreadcrumbList.
- MusicRecording: canonical#recording, url, name, existing meta description, Song.releaseDate, PropertyValue Song ID, mainEntityOfPage.
- No byArtist, recordingOf, inAlbum, duration, ISRC, ratings or reviews.
- Visible breadcrumb and JSON-LD now match: ホーム → 曲一覧 → Song name. Links: /index.html → /songs.html → /song/Sxxx.html.
- All 117 HTML hashes and renderer fingerprints updated in song/manifest.json. Normal snapshot generation/current-switch hooks already invoke this generator; no opt-in flag needed.
- Dedicated validation 119/119 PASS (all 117 records, valid dates, names, descriptions, canonical, identifiers, breadcrumb positions/URLs/names, prohibited fields, generation coverage).
- Combined regression 178/178 PASS: dedicated, prerender, Song/Static UI, SEO, share, internal links, sitemap and Web smoke (6/6). Representatives S001/S003/S117: JS OFF/ON at 1280/390; no overflow, no page/console errors.
- Sitemap remains 241 URLs; share check remains Song 117 + Event 353. No sitemap/share modification.
- git diff --check PASS.
- Schema Markup Validator repeat check is INCOMPLETE: service returned HTTP 405, then unusual-traffic/CAPTCHA. No bypass or further requests. The previous two-level PoC had errors 0/warnings 0; that result is not claimed for this new three-level version.
- No commit/push. Existing current/new Static generation, preview and card-related differences preserved.

Current change files: generator, song.html breadcrumb template, assets/js/song-v441.js breadcrumb text update, song/S001.html–S117.html, song/manifest.json, tests/song-structured-data.test.cjs, tests/song-prerender-poc.test.cjs, this audit and the preceding PoC audit.
