const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");

test("Release/Song detail have reserved loading skeletons", () => {
  const releaseHtml = read("release.html");
  const songHtml = read("song.html");
  assert.match(releaseHtml, /id="releaseSkeleton"[^>]*aria-hidden="true"/);
  assert.match(songHtml, /id="songDetailSkeleton"[^>]*aria-hidden="true"/);
  assert.match(releaseHtml, /\.release-hero\{min-height:/);
  assert.match(songHtml, /\.song-hero-v46\{min-height:/);
});

test("Song discover starts before Song detail await and stays secondary", () => {
  const source = read("assets/js/song-v441.js");
  const loadStart = source.indexOf("async function loadSong()");
  const discoverStart = source.indexOf("const discoverPromise = apiGet(", loadStart);
  const songAwait = source.indexOf("let response = await detailWithApiFallback(", loadStart);
  const mainRender = source.indexOf("renderSong(response.data)", loadStart);
  const discoverAwait = source.indexOf("await discoverPromise", loadStart);
  assert.ok(loadStart >= 0 && discoverStart > loadStart);
  assert.ok(discoverStart < songAwait, "Discover request must start before awaiting Song detail");
  assert.ok(mainRender < discoverAwait, "Main Song render must not await Discover");
  assert.match(source.slice(discoverAwait), /Song discover API error:/);
});

test("Release keeps every relation in the automatically rendered DOM", () => {
  const source = read("assets/js/release-v500.js");
  assert.match(source, /groups\.map\(\(group, index\) => `<details/);
  assert.match(source, /group\.songs\.map\(song => includedSongRow\(song, true\)\)\.join\(""\)/);
  assert.doesNotMatch(source, /requestIdleCallback|toggle[^\n]*includedSongRow/);
});
