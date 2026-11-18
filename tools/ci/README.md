# AUTO-SYNC-02: isolated, non-publishing Actions experiment

Base main: `431782937b68eb2beca42d665b2176cf01a9b609`.

The user approved a PR-only bootstrap because GitHub does not initially dispatch a workflow absent from the default branch. `workflow_dispatch` remains defined. The PR trigger accepts only the same-repository head branch `auto-sync-02-dry-run-20261118`. No `push`, `schedule`, `pull_request_target`, merge, deployment or publication operation exists. Token permissions are `contents: read`; checkout credentials are not persisted. Generated changes are never staged or committed by the workflow.

Pinned runtime: Ubuntu 24.04, Node 24.19.0, Playwright 1.62.1 via the existing lockfile, Chrome for Testing 158.0.8127.36, Noto CJK package 1:20230817+repack1-3. All three GitHub Actions are pinned to commit SHAs. Runner-image library updates remain a recorded environment difference from Windows.

The experiment first checks the unchanged-revision no-op decision (zero generator invocations). It separately forces a full rebuild in the disposable runner by retaining the matching existing snapshot under the artifact output, then invoking the unchanged official generator. It uses the official local-current switch, gap/share generation, sitemap check, independent validator, integrity/provenance and related tests. The normal unchanged-revision gate is tested again after generation. This is not yet an automatically publishing synchronizer.

`read-only-network.cjs` preloads only in child generation/test processes. Node fetch is GET-only, local or on the named public GAS read actions. Any access/rate/server/DNS/payload error is classified in a network journal and terminates the child immediately, before the generator's generic retry loop can issue another request. Browser generation retains its existing pinned-input capture mechanism. Representative actual event UI tests use fresh Chrome contexts, actual generated JSON, PC1280/mobile390, and block GAS/YouTube; no synthetic API fixture or actual YouTube playback is counted as a display PASS.

The Windows comparison requires the same data/output revisions as the current published baseline. It compares all Song/Release/Event data fields, IDs, order and duplicate rows; only `_cache` transport metadata and outer capture timestamps are excluded. Generated HTML bytes may differ across Chrome/OS versions, but the independent existing validator and DOM contract remain unchanged. Raw differences are saved rather than silently treated as byte-identical. Revision drift or an unexplained content difference fails the run.

Artifact retention is seven days. Available result/log/network/error files and generated output are retained even after failure where possible. Partial steps and unrun browser conditions are not PASS. The existing optional skipped integration test remains separately counted. No previous Windows PASS totals are added to this run.

Remaining before any production integration:

- Read and compare the current management GAS HEAD with the archived immutable v26 source, preserving unpublished changes. That comparison is not performed by this workflow and no Google OAuth credential is uploaded.
- Add shared PC/mobile completed-generation state; distinguish RAW registration, API readiness and Pages deployment status. The existing mobile "Web reflected" status checks only Public API revision.
- Design generation/publication concurrency fencing, retries/recovery, deploy authorization and source-setting changes under separate approval.
- A successful trial does not prove that new production APIs, changes in Song/Release ID counts, or future data revisions will satisfy all current fixed-count contracts.

Stop after reporting Actions status, elapsed time, actual test counts, browser results and artifact link. Do not merge this experiment or deploy its output.
