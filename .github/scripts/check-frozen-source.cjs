'use strict';

const assert = require('node:assert/strict');
const {execFileSync} = require('node:child_process');
const path = require('node:path');
const config = require('../../tools/auto-sync/config.json');
const {client} = require('../../tools/auto-sync/http.cjs');
const {sha, same, sourceFingerprint} = require('../../tools/auto-sync/policy.cjs');
const {readStrict} = require('../../tools/auto-sync/readiness-client.cjs');
const {callDirect} = require('../../tools/auto-sync/publication-fence.cjs');
const {freezeSource, frozenTransport} = require('../../tools/auto-sync/frozen-source.cjs');

const repository = 'xenotopi/mus-song-database';
const workflowRef = repository + '/.github/workflows/auto-sync-monitor.yml@refs/heads/main';
const target = Object.freeze({
  dataRevision: 'sha256-9285c221fcbdc49270f30fb44a87cb22b8ccc8b45d370e011fd9bf5131be6864',
  outputRevision: 'sha256-d68f4b9a284da124ecd4ba1827b0a57900f1851ee9e3e132e9cc93da7ca6a5a7',
});
const completionSha256 = '1698bb9d76496b616a2a26238a06dea518d42356262a8740be50ccab1d1899cb';
const sourceImageSha256 = '3ae15fd39ec728c108e253dcfdcb9161a533c33c5b12c94a134ba21184da9004';
const stoppedVariables = [
  'MUSDB_AUTO_SYNC_ENABLED', 'MUSDB_EVENT_MONITOR_ENABLED', 'MUSDB_EVENT_PUBLICATION_ENABLED',
  'MUSDB_PAGES_DEPLOY_ENABLED', 'MUSDB_LEGACY_MANUAL_ENABLED', 'MUSDB_PUBLICATION_FENCE_ENABLED',
];

function approvedContext(env, readyKey, sourceKey) {
  const sourceSha = env.MUSDB_SYNC_EXPECTED_MAIN;
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const expected = {
    GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: '1318600615',
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true', GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_WORKFLOW_SHA: sourceSha, GITHUB_SHA: sourceSha, GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_ACTOR: 'xenotopi', GITHUB_ACTOR_ID: '311514545', GITHUB_TRIGGERING_ACTOR: 'xenotopi',
    GITHUB_RUN_NUMBER: '2', GITHUB_RUN_ATTEMPT: '1', MUSDB_FROZEN_TRIAL_SEND: 'true',
    MUSDB_SYNC_SIGNING_ENABLED: 'true', MUSDB_SYNC_SIGNING_KID: 'as54-ready-v1',
    MUSDB_SYNC_EXPECTED_DATA_REVISION: target.dataRevision, MUSDB_SYNC_EXPECTED_OUTPUT_REVISION: target.outputRevision,
  };
  for (const [name, value] of Object.entries(expected)) assert.equal(env[name], value);
  assert.ok(stoppedVariables.every(name => [undefined, '', 'false'].includes(env[name])));
  assert.match(env.GITHUB_RUN_ID, /^[1-9][0-9]{0,19}$/);
  assert.ok([readyKey, sourceKey].every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)));
  assert.notEqual(readyKey, sourceKey);
  return {runId: env.GITHUB_RUN_ID, attempt: 1, sourceSha};
}

async function check({env, readyKey, sourceKey, root, request = globalThis.fetch, now = Date.now}) {
  let stage = 'CONTEXT';
  let signedBody;
  let readyRequests = 0;
  let issuedAt;
  try {
    const run = approvedContext(env, readyKey, sourceKey);
    const head = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], {cwd: root, encoding: 'utf8'}).trim();
    assert.equal(head, run.sourceSha);
    const fingerprint = sourceFingerprint(root);
    const http = client(config, {fetch: request, token: null});
    async function verifyLiveTarget() {
      const [main, live] = await Promise.all([http.mainSha(), http.latest()]);
      assert.equal(main, run.sourceSha);
      assert.ok(same(live, target));
    }
    const readyOptions = {
      apiUrl: config.apiUrl, target, now,
      credentials: {audience: config.signedReadiness.audience, kid: env.MUSDB_SYNC_SIGNING_KID, key: readyKey},
      invocation: {fingerprint, sourceSha: run.sourceSha, repositoryId: env.GITHUB_REPOSITORY_ID,
        workflowRef, phase: 'monitor', runId: run.runId, runAttempt: run.attempt},
      completionOptions: {maxAgeSeconds: config.maximumReadinessAgeSeconds, stableSeconds: config.minimumStableSeconds},
    };

    stage = 'PRECHECK';
    await verifyLiveTarget();
    stage = 'READY';
    const ready = await readStrict({...readyOptions, fetch: (url, init) => {
      if (init.method === 'POST') {
        assert.equal(readyRequests++, 0);
        signedBody = init.body;
        issuedAt = JSON.parse(signedBody)[3];
      }
      return request(url, init);
    }});
    assert.equal(ready.state, 'ready');
    assert.ok(same(ready, target));
    assert.equal(sha(ready.completionId), completionSha256);
    assert.equal(ready.sourceImageSha256, sourceImageSha256);

    stage = 'READY_REPLAY';
    const replay = await readStrict({...readyOptions, fetch: (url, init) => {
      if (init.method !== 'POST') return request(url, init);
      assert.equal(readyRequests++, 1);
      assert.ok(now() >= issuedAt && now() - issuedAt <= 50000, 'Replay window too short');
      return request(url, {...init, body: signedBody});
    }});
    signedBody = undefined;
    assert.equal(readyRequests, 2);
    assert.ok(now() - issuedAt <= 55000, 'Replay rejection was observed too late');
    assert.equal(replay.state, 'unknown');
    assert.equal(replay.reason, 'AUTH_REQUIRED');
    assert.equal(replay.dataRevision, null);
    assert.equal(replay.outputRevision, null);
    assert.equal(replay.completionId, undefined);

    stage = 'FROZEN_OPEN';
    await verifyLiveTarget();
    const frozen = await freezeSource({target, sourceImageSha256, completionSha256, sourceSha: run.sourceSha}, {
      fence: async (action, {payload}) => {
        assert.equal(action, 'open-source');
        const result = await callDirect({role: 'source_manual', route: 'source/open', key: sourceKey, fetch: request, now,
          payload: {target, sourceImageSha256, completionSha256, tokenSha256: payload.tokenSha256,
            sourceSha: run.sourceSha, mode: 'manual', run}});
        assert.equal(result.status, 'FROZEN');
      },
    });
    stage = 'FROZEN_READ';
    const readFrozen = frozenTransport({...frozen, fetch: request});
    const frozenUrl = action => {
      const url = new URL(config.apiUrl);
      url.searchParams.set('action', action);
      return url;
    };
    const revision = await readFrozen(frozenUrl('revision'), {signal: AbortSignal.timeout(30000)});
    assert.equal(revision.status, 200);
    assert.ok(same((await revision.json()).data, target));
    const songUrl = frozenUrl('song');
    songUrl.searchParams.set('id', 'S066');
    const song = await readFrozen(songUrl, {signal: AbortSignal.timeout(30000)});
    assert.equal(song.status, 200);
    const representative = (await song.json()).data;
    assert.equal(representative?.songId, 'S066');
    assert.ok(typeof representative.songName === 'string' && representative.songName.length > 0);

    stage = 'FINAL_CHECK';
    await verifyLiveTarget();
    return {status: 'PASS', runId: run.runId, main: run.sourceSha, ready: true, replayRejected: true,
      frozenIssued: true, frozenReads: 2, ...target, completionSha256, sourceImageSha256};
  } catch {
    return {status: 'STOP', stage};
  }
}

if (require.main === module) {
  const readyKey = process.env.MUSDB_SYNC_SIGNING_KEY;
  const sourceKey = process.env.MUSDB_DIRECT_MANUAL_SOURCE_KEY;
  delete process.env.MUSDB_SYNC_SIGNING_KEY;
  delete process.env.MUSDB_DIRECT_MANUAL_SOURCE_KEY;
  check({env: process.env, readyKey, sourceKey, root: path.resolve(__dirname, '../..')}).then(result => {
    console.log(JSON.stringify(result));
    if (result.status !== 'PASS') process.exitCode = 1;
  });
}

module.exports = {check};
