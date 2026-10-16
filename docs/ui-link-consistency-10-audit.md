# UI-LINK-CONSISTENCY-10: About / 404 / remaining link roles

Baseline: `eea892b577d2bf7666105a5dee265553e68c742a`. Local implementation only; no commit, push or deployment in this step.

## Implemented

About's four `a.about-explore-card` elements remain TYPE A native links, including category icon, title, description and padding. Their original songs/events/venues/singers hrefs and text are unchanged. Existing `mus-card-link mus-chip-link`, `mus-card-title mus-title-chip` and `mus-title-tail` classes opt into unchanged `link-ui.css?v=2`. The last two title characters stay with the chevron. Category icons remain 40px hosts / 24px SVG; title chevrons are 30px hosts / 16px SVG. The redundant right-hand arrow column is removed. Only the chevron moves; the former whole-card upward hover transform is removed. The existing two-column / one-column grid is preserved.

About JS, API data, summary, policies, version/update text, external Google Form and Analytics settings remain untouched. The new stylesheet is registered in HTML reference order in `tests/active-entrypoints.json`; permanent tests are registered in `test:ui-links`.

404 remains unchanged. Its two native navigation/action links are not converted to title-chip cards. Chrome's existing keyboard focus outline is visible at both tested widths. The copy and `noindex,follow` remain unchanged. Direct `/404.html` returns HTTP 200; a missing root-level URL returns the custom page with HTTP 404. The latter necessarily generates a document-level HTTP 404 console message: it is recorded as the expected response, not hidden as a successful request. Unexpected resource errors and JavaScript errors are checked separately. This does not establish behavior for every nested missing path or real Safari.

## Remaining-link audit (no additional product changes)

| Area | Current role / evidence | Decision / remaining work |
|---|---|---|
| About: record exploration | Four outer native anchors; category icons, descriptive text and padding share the destination | TYPE A title chips implemented here |
| About: Google Form | External anchor, external-link icon, `_blank`, `noopener noreferrer external` and explicit external accessible label | Keep external action; no lavender chevron / nested card conversion |
| About: Analytics | Native settings button opens the existing dialog; closing restores focus and preserves the prior rejected consent value | TYPE D; no title-chip conversion or consent implementation changes |
| 404 | Search and Home navigation links, rounded button-like affordance, at least 46px high | Functional links remain as-is; keyboard and root-level Pages missing-URL behavior verified |
| Home: tools | Three `a.home-tool-card` links to Member Analytics, checker and gap rankings, each with an explicit action phrase / arrow-right | Clear single-destination functional cards; keep existing full hit area and functional CTA. Optional future harmonization is a separate design decision, not an automatic chevron replacement |
| Home: explore / Kamipara entry | Native full-card links with existing category/action styling; not the recently unified title-chip variants | Residual visual consistency candidate. Do not silently expand UI10 to these cards |
| Published five lists | Native TYPE A outer anchors; Release supplementary Song links are separate TYPE B links | Retain published UI05 behavior; never absorb supplementary links into the outer anchor |
| Song / Event / Singer / Venue details | Published title chips follow link roles; Singer/supporting links stay independent; show/hide controls remain buttons or summaries | Retain UI04B/06/06A behavior and current section structure |
| Release detail | Official generated pages retain their existing Release-specific song/related/action link designs; R0072's song cards are intentionally nonlinks | Remaining design expansion requires separate authorization and formal Release114 capture / manifest / provenance synchronization; not implemented here |
| Rankings / statistics / checker / gap rankings / Member Analytics | Published opt-in title links; independent action/support links and nonlink figures retain their roles | No blanket anchor or chevron change. Statistics' nonlink overview articles and Member numeric cells remain nonlinks |
| Kamipara | Dark-theme R0072 action link; S118-S127 song cards remain nonlinks; history details/summary remain disclosure controls | Keep existing theme and disclosure semantics; no invented Song URLs |
| External / sharing / supplementary links | External-link / action-arrow / underlined supporting-link roles differ from primary titles | Preserve these differences; uniform primary styling is not a mandate to style every anchor identically |
| Common header / drawer | UI09's A/B/C audit still applies | All C items remain deferred: opening focus, keyboard containment, candidate priority and ARIA. `common.js` changes require separately authorized Song117 + Release114 capture and independent verification |

## Regression approach

Permanent UI10 tests compare card href/title/description/category icons with the baseline DOM, exercise all four destinations with middle click, Control click, Enter and card padding, and verify actual destination document URLs. New-tab/navigation waiters are registered before interaction, using navigation commit. Destination-specific routes do not bypass API mocks. A padding hit point is checked with `elementFromPoint` before clicking: the transparent outside corner of a rounded rectangle is not treated as card padding.

Hover tests retain link and icon handles, verify element identity, flush style, await Web Animations API `finished`, then sample after requestAnimationFrame. They assert 3px final movement, unchanged link rectangle, 30/16px centered geometry, keyboard focus and reduced-motion 0px / transition none. Long mixed-language titles are tested without changing production copy. Other permanent checks cover About's external form / settings dialog and both direct and simulated missing-URL 404 behavior at 1280/390px.

Formal Song/Release renderer dependency sets exclude `about.html`. No dependency file, formal HTML, manifest, snapshot, current pointer, Revision or common asset is changed. No formal capture is run. Real iPhone / Safari remains unverified.
