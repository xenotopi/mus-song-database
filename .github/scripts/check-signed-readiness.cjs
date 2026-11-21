'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash, createHmac, randomBytes } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const repository = 'xenotopi/mus-song-database';
const repositoryId = '1318600615';
const workflowRef = repository + '/.github/workflows/auto-sync-monitor.yml@refs/heads/main';
const mainUrl = 'https://api.github.com/repos/' + repository + '/git/ref/heads/main';
const apiUrl = 'https://script.google.com/macros/s/AKfycbxCz1UYaUn7CPxwoKUlfMG2tMmv9HjdVBPtZBCXoEo8GoTE4WneNvUflvpqRYpAM-_i/exec';
const audience = 'musdb-readiness:production';
const revisionFormat = /^sha256-[a-f0-9]{64}$/;
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Match the source fingerprint in the reviewed AUTO-SYNC policy.
function sourceFingerprint(root) {
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      assert.ok(!fs.lstatSync(file).isSymbolicLink());
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) files.push(path.relative(root, file).replace(/\\/g, '/'));
    }
  }
  for (const dir of ['assets', 'tools', '.github']) walk(path.join(root, dir));
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.isFile() && /\.(html|webmanifest)$/.test(entry.name)) files.push(entry.name);
  }
  const generated = ['current.json', 'gap-rankings.json', 'sync-release.json', 'sync-files.json'];
  for (const file of fs.readdirSync(path.join(root, 'data'))) {
    if (/\.json$/.test(file) && !generated.includes(file)) files.push('data/' + file);
  }
  for (const file of ['tests/package.json', 'tests/package-lock.json', 'CNAME', 'robots.txt', '.nojekyll']) {
    if (fs.existsSync(path.join(root, file))) files.push(file);
  }
  return sha256(JSON.stringify(files.sort().map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    const text = /\.(?:html|css|js|cjs|json|ya?ml|webmanifest)$/.test(file);
    return [file, sha256(text ? Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')) : bytes)];
  })));
}

function approvedContext(env, key) {
  const sourceSha = env.MUSDB_SYNC_EXPECTED_MAIN;
  assert.match(sourceSha, /^[a-f0-9]{40}$/);
  const claims = {
    GITHUB_REPOSITORY: repository, GITHUB_REPOSITORY_ID: repositoryId,
    GITHUB_REF: 'refs/heads/main', GITHUB_REF_PROTECTED: 'true',
    GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_WORKFLOW_REF: workflowRef,
    GITHUB_WORKFLOW_SHA: sourceSha, GITHUB_SHA: sourceSha,
    GITHUB_RUN_NUMBER: '1', GITHUB_RUN_ATTEMPT: '1',
    MUSDB_SYNC_SMOKE_SEND: 'true', MUSDB_SYNC_SIGNING_ENABLED: 'true'
  };
  for (const [name, expected] of Object.entries(claims)) assert.equal(env[name], expected);
  assert.match(env.GITHUB_RUN_ID, /^[1-9][0-9]{0,19}$/);
  assert.match(env.MUSDB_SYNC_SIGNING_KID, /^[A-Za-z0-9_-]{1,48}$/);
  assert.match(key, /^[a-f0-9]{64}$/);
  const dataRevision = env.MUSDB_SYNC_EXPECTED_DATA_REVISION;
  const outputRevision = env.MUSDB_SYNC_EXPECTED_OUTPUT_REVISION;
  assert.match(dataRevision, revisionFormat);
  assert.match(outputRevision, revisionFormat);
  return { sourceSha, dataRevision, outputRevision };
}

async function getJson(request, url, options = {}) {
  const signal = AbortSignal.timeout(30000);
  const headers = { accept: 'application/json', 'cache-control': 'no-cache' };
  const common = { signal, headers, redirect: 'manual', referrerPolicy: 'no-referrer' };
  let response = await request(url, options.body === undefined
    ? { ...common, method: 'GET' }
    : { ...common, method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: options.body });
  if (options.contentService && [302, 303].includes(response.status)) {
    const redirect = new URL(response.headers.get('location') || '', url);
    assert.equal(redirect.origin, 'https://script.googleusercontent.com');
    assert.equal(redirect.pathname, '/macros/echo');
    assert.ok(!redirect.username && !redirect.password && !redirect.hash);
    response = await request(redirect.href, { ...common, method: 'GET' });
  }
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') || '', /^application\/json\b/i);
  const maxBytes = 16384;
  assert.ok(Number(response.headers.get('content-length') || 0) <= maxBytes);
  let size = 0;
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    assert.ok(size <= maxBytes);
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks));
}

function assertRevisions(data, expected) {
  assert.equal(data.dataRevision, expected.dataRevision);
  assert.equal(data.outputRevision, expected.outputRevision);
}

function assertReady(reply, expected, now) {
  assert.equal(reply.success, true);
  const data = reply.data;
  assert.equal(data.schemaVersion, 1);
  assert.equal(data.authority, 'shared-update-completion-v1');
  assert.equal(data.state, 'ready');
  assertRevisions(data, expected);
  assert.equal(data.activeUpdate, false);
  assert.equal(data.allStepsSucceeded, true);
  assert.equal(data.updateLogWritten, true);
  assert.match(data.completionId, /^[a-zA-Z0-9:_-]{1,128}$/);
  assert.ok(['pc', 'mobile'].includes(data.source));
  const observed = Date.parse(data.observedAt);
  const completed = Date.parse(data.completedAt);
  assert.ok(observed <= now + 5000 && observed >= now - 120000);
  assert.ok(completed <= observed && now - completed >= 60000);
}

async function check({ env, key, root, request = globalThis.fetch, now = Date.now }) {
  let stage = 'CONTEXT';
  let postAttempts = 0;
  try {
    const target = approvedContext(env, key);
    const head = execFileSync('git', ['--no-optional-locks', 'rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(head, target.sourceSha);
    const fingerprint = sourceFingerprint(root);
    const verifyTarget = async () => {
      const revision = await getJson(request, apiUrl + '?action=revision', { contentService: true });
      assert.equal(revision.success, true);
      assertRevisions(revision.data, target);
      const main = await getJson(request, mainUrl);
      assert.equal(main.ref, 'refs/heads/main');
      assert.equal(main.object.sha, target.sourceSha);
    };
    stage = 'PRE_POST';
    await verifyTarget();
    stage = 'SIGNED_READINESS';
    // Keep the canonical field order and signing prefix used by v66.
    const fields = [
      2, audience, env.MUSDB_SYNC_SIGNING_KID, now(), randomBytes(16).toString('hex'),
      target.dataRevision, target.outputRevision, fingerprint, target.sourceSha,
      repositoryId, workflowRef, 'monitor', env.GITHUB_RUN_ID, 1
    ];
    const mac = createHmac('sha256', key).update(JSON.stringify(['POST', 'syncReadiness', ...fields]), 'utf8').digest('hex');
    const body = JSON.stringify([...fields, mac]);
    assert.ok(body.length <= 1024);
    postAttempts = 1;
    const reply = await getJson(request, apiUrl, { contentService: true, body });
    assertReady(reply, target, now());
    stage = 'POST_VERIFY';
    await verifyTarget();
    return { status: 'READY', postAttempts };
  } catch {
    // Never emit a body, secret, nonce, response URL, or underlying exception.
    return { status: 'STOP', stage, postAttempts };
  }
}

if (require.main === module) {
  const key = process.env.MUSDB_SYNC_SIGNING_KEY;
  delete process.env.MUSDB_SYNC_SIGNING_KEY;
  check({ env: process.env, key, root: path.resolve(__dirname, '../..') }).then(result => {
    console.log(JSON.stringify(result));
    if (result.status !== 'READY') process.exitCode = 1;
  });
}

module.exports = { check };
