# Core search integration — 2026-09-23

Status: implemented locally in the main app at http://localhost:8081/.
No deployment. Phase 1 copy corrections and the first phase 3a search integration
are complete for local review; the homepage directory and modal redesign remain
next. The separate `/review.html` prototype remains the visual reference.

## Behavior

- Search indexes existing program descriptions, name, host and mapped category;
  episode topics, notes and guests are indexed separately alongside name/host.
- Show-description matches return shows, not inferred topic matches for every
  recording. On the reviewed feed, “jazz” returns four shows and zero episode
  matches. Listeners can open each show's available recordings.
- Exact names rank ahead of prefixes, phrases and matching words. Accents and
  punctuation normalize. Text fields are prepared at ingestion/directory refresh
  rather than concatenated per recording on every keystroke.
- Separate Shows/Episodes sections and counts; All/Shows/Episodes scopes. All
  results preview up to three episodes per program, with a full matching list.
  Results expand in batches; query, category, scope and a selected show's match
  filter are reflected in the URL and survive modal navigation/reload.
- Result context identifies matching fields. Empty states offer reset. The
  category dropdown now says “All categories”. The ordinary unsearched archive
  remains episode-based, with corrected “episodes found”, “Latest episode”, loading
  and refresh wording.
- Show results open the existing available-episodes sheet; episode results open
  the existing episode sheet. Play uses the current player, resume state and
  controls. This phase deliberately does not replace the modal/player system.
- Existing live/schedule controls, station policy, share links and archive API are
  retained. No QIR calls or additional telemetry; queries remain local.

## Files and validation

`public/archive-search.js` is a pure browser/CommonJS index shared with
`test/pacifica/search.test.js`; it loads before app.js. Main UI changes are in
app.js, index.html and styles.css. The new suite is wired into tools/run-tests.js.

`npm test` passed: inherited offline suites and 42 Pacifica tests, including four
new search cases (show/episode separation, exact-name ranking, guests/topics,
accent/punctuation normalization, category filtering and rebuilt indexes).

24 browser checks passed against the main app: actual jazz results, served version
and asset bytes, show/episode navigation, capped previews and matching list scope,
search retention after closing, real audio playback and continuity while searching,
reset/episode counts, both themes at 360/390/560/768/1280px without horizontal
overflow, and no runtime exceptions. Desktop screenshot inspected; corrected page
gutters to align with the existing controls. Final layout rerun passed all 24 checks again after those adjustments.

No real-phone or screen-reader audit yet. Existing WBAI browser suites were not
claimed as adapted or passing; this phase used a focused Chrome interaction probe.
The tests preserve a representative directory-description match that the former
title/category/host-only search could not satisfy.

## Next review and implementation

Open http://localhost:8081/?q=jazz and compare with
http://localhost:8081/?q=democracy%20now. Review the match hierarchy and navigation.
Continue with the approved one-card-per-show homepage and compact episode-modal
layout, using the existing player lifecycle. Canonical program routes, show detail
content hierarchy, complete accessibility/phone acceptance and multi-part grouping
remain separate work. Plugin integration is independent and still pending access.
