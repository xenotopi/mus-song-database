# UI09: Search UI and read-only common navigation audit

Baseline: `a0cc3fe28ab485aabe88d3c8a59b875ed3f74b43`. Local-only; no publication authorization.

## Search implementation

The five result renderers keep their existing outer `a.result-row` and href helpers (TYPE A). Category badges remain left; the old right column/arrow is removed. Each title opts into existing `link-ui.css` classes. Alias badges remain separate from the title chip, inside the same outer link. Metadata and padding remain clickable. A page-scoped inset focus outline avoids clipping by the rounded result container.

`normalize`, `highlight`, `searchGeneration`, request handling and analytics are unchanged. The title helper parses only the existing escaped highlight output, then uses a DOM Range to extract the last two Unicode code points with their highlight elements. It never cuts serialized HTML. Highlighted text may occupy adjacent spans when the Range crosses a highlight boundary; the concatenated highlight coverage is unchanged. API strings/aliases are still escaped; no arbitrary HTML is accepted.

## Common navigation audit (no common.js changes)

| Area | Class | Evidence / decision |
|---|---|---|
| PC header search | A | Existing native anchors and ID-based URL helpers. Alias metadata is escaped. ArrowDown/ArrowUp select and wrap; Enter navigates to the active candidate or full results; Escape clears/closes and blurs. Full-results button preserves encoded `q`. |
| Candidate count | A | At most six; not a promise that every response always shows six. Per-category limits are singers 2, songs 2, releases 1, events 2, venues 1, then global `slice(0,6)`. Fixtures with all five categories verify href consistency with Search. |
| PC active nav | A | `renderCommon(active)` explicitly marks nine existing menu entries. Search intentionally passes an empty active key. Existing common-navigation regression covers geometry and Release list/detail active states. |
| Drawer basics | A | Toggle/close/overlay/Escape update `aria-expanded`, `aria-hidden`, scroll lock and class state; Escape/close restore focus to the toggle. Hidden drawer uses `visibility:hidden`. Existing menu links remain unchanged. |
| Footer | A | Current generated footer has branding, copyright and Amazon disclosure, **zero anchor links**. No fictitious footer links were added or removed. |
| Candidate visual refinement | B | Page-scoped opt-in CSS could refine colors/wrapping/focus without editing common.js. Not implemented here; no blanket chevrons added to navigation. |
| Candidate composition priority | C | With dense results, the global six-item cap can omit Venue because earlier categories consume the slots. Changing prioritization or reserving one slot per category changes common.js behavior; needs a separate product decision and formal capture synchronization. |
| Drawer opening focus | C | Browser audit records initial active element `musMobileMenuButton`, not the close button. Source calls `closeButton.focus()` while the drawer is still hidden, before requestAnimationFrame adds `is-open`. Moving focus after visibility requires common.js changes. **Unresolved in UI09.** |
| Drawer keyboard containment | C | Tab after the last drawer link reaches outside it; there is no focus trap/background inert handling. Decide modal versus non-modal semantics before changing. **Unresolved in UI09.** |
| Header accessible naming / semantics | C | Search input label currently omits Release. Input uses aria-controls/expanded; options update aria-selected, but no combobox role / aria-activedescendant is maintained. Improvements require a separately reviewed common.js change. |
| Header chip redesign | C | Existing right-edge small chevron remains untouched. Moving/structurally changing it to a title chip would edit common.js and affect serialized header markup. |

`common.js` is in both official Song and Release renderer fingerprint sets. C items are not permanent exceptions: a later authorized change must follow official Song117/Release114 capture, manifest/provenance synchronization and independent validation. No such capture is performed in UI09. Existing header/native-card interactions are not globally redesigned by Search's opt-in classes.

## Validation scope

Permanent UI regression covers all five categories, legacy text/highlight/href comparison, special characters, long unbroken names, alias-only matches, all/category tabs, zero results/research, full-card padding/badge/metadata clicks, native middle/Control clicks and Enter navigation. Waiters precede actions; navigation waits for commit and verifies destination document.URL; routing is exact-destination only, not a catch-all overriding API mocks.

Existing latest-response regression retains reversed responses, stale success/failure, URL and analytics checks. Common navigation findings are audited, not silently "fixed" or represented as accessibility PASS. PC/390px automated browser checks do not establish real iPhone/Safari validation.
