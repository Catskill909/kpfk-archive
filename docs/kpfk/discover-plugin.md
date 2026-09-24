# Discover interface plugin — 2026-09-23

Paul requested keeping the preferred design prototype as a plugin for now.
Implemented interpretation: an optional bundled discovery interface in the archive
application, separate from QIR enrichment. A clarification was offered; the main
app remains at `/`, including its improved search. No deployment.

## Standalone development supersedes this embedded snapshot

On 2026-09-23 Paul requested a separate private Pacifica repository. Development
now continues in [pacifica-foundation/kpfk-discovery-plugin](https://github.com/pacifica-foundation/kpfk-discovery-plugin),
local folder `/Users/paulhenshaw/Desktop/kpfk-discovery-plugin`, port 8082.
The product name is undecided. The embedded route below is retained as an earlier
snapshot; new player and plugin work belongs in the standalone project.

## Clarified direction and subsequent implementation

Paul clarified that this is first the KPFK QIR API beta, not simply a second core
interface. See [QIR beta build](qir-beta-build.md). An explicit source selector
now separates archive preview from API content; without a key, API mode reports
connection pending. The original packaging notes below are historical where they
say no QIR adapter exists. Global template adoption will be decided phase by phase.

## Use and configuration

Open **http://localhost:8081/discover** or select **Discover shows** in the main
app's side menu. `/review.html` remains a compatibility address for the same view.
The view retains the approved prototype layout, real archive data, show directory,
search, show/episode dialogs and native audio player. Theme preference now uses
the same persisted station setting as the main app.

`stations/kpfk.json` enables it with:

```json
"plugins": { "discovery": true }
```

Missing setting means disabled; only boolean values are accepted. Set false and
restart to remove the menu item and return 404 for `/discover`, `/discover/`,
`/review.html`, `/review.js`, and `/review.css`. This is a station-profile toggle,
not a studio settings UI, installed third-party code, or arbitrary plugin loader.
The public profile exposes only the supported discovery boolean.

## Boundaries

No QIR requests or processing code. Same-origin `/api/archive` is the data source.
The separate interface still uses its own native player: moving to the main app
loads another page and does not transfer playback or listening progress. It has
no live/schedule UI; those remain in the main app. Existing prototype limitations
in [phase 0b](phase-0b-review.md) still apply except for route gating and persisted
theme preference, which are now implemented. Files retain review.* names to keep
this packaging change small. This is an optional preview, not a declaration that
all production design phases are complete.

## Evidence

Full `npm test` passed: inherited suites plus 43 Pacifica tests. HTTP integration
checks enabled route/assets and then restarts with the plugin disabled, confirming
all five routes return 404, the menu entry disappears, and the core archive still
recovers its data while upstream is offline. Menu tests verify default-off and
reject string booleans. Browser verified main menu link, enabled profile, Discover
jazz results, theme surviving reload and 390px layout without overflow.

Local server restarted on port 8081; no other server touched. Test browser closed.
