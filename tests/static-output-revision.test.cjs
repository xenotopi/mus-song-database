const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const dataRevision = `sha256-${'a'.repeat(64)}`;
const outputRevision = `sha256-${'b'.repeat(64)}`;

function loader(current, files) {
  const reads = [];
  const context = vm.createContext({
    AbortSignal,
    localStorage: { setItem() {}, getItem() { return null; } },
    fetch: async url => {
      reads.push(url);
      return { ok: true, json: async () => url === 'data/current.json' ? current : files[url] };
    }
  });
  const code = fs.readFileSync(path.join(__dirname, '..', 'assets/js/static-detail.js'), 'utf8').replaceAll('export ', '');
  vm.runInContext(code, context);
  return { context, reads };
}

test('new Static path uses output revision while Event content uses data revision', async () => {
  const current = { revision: outputRevision, outputRevision, dataRevision };
  const event = { eventId: 'EV0348', eventName: 'ライブ2011Natural Party', songs: [{ songId: 'S003', singerId: 'SN0072' }], statistics: {}, navigation: {}, relatedReleases: [], _cache: { revision: dataRevision } };
  const discover = { eventId: 'EV0348', firstPerformedSongs: [], lastPerformedSongs: [], uniqueSongs: [], _cache: { revision: dataRevision } };
  const url = `data/snapshots/${outputRevision}/events/EV0348.json`;
  const { context, reads } = loader(current, { [url]: { snapshot: { revision: outputRevision, outputRevision, dataRevision }, data: { event, discover } } });
  const result = await vm.runInContext('staticEventDetail("EV0348")', context);
  assert.equal(result.revision, outputRevision);
  assert.equal(result.dataRevision, dataRevision);
  assert.equal(result.data.event.songs[0].singerId, 'SN0072');
  assert.deepEqual(reads, ['data/current.json', url]);
});

test('legacy Static pointer and wrapper remain readable', async () => {
  const url = `data/snapshots/${dataRevision}/songs/S003.json`;
  const wrapper = { snapshot: { revision: dataRevision }, data: { songId: 'S003', includedReleases: [], performances: [], _cache: { revision: dataRevision } } };
  const { context } = loader({ revision: dataRevision }, { [url]: wrapper });
  const result = await vm.runInContext('staticDetail("song", "S003")', context);
  assert.equal(result.revision, dataRevision);
  assert.equal(result.dataRevision, dataRevision);
});
