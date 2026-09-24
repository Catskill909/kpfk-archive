# Phase 0b — interactive design review

Built 2026-09-23. Local review: http://localhost:8081/review.html.
Compare existing app: http://localhost:8081/.

## Delivered

- Independent review surface in `public/review.html`, `review.css`, `review.js`.
  Existing app/player files and server behavior unchanged; no deployment.
- Real `/api/archive` rows and directory metadata; no QIR requests, credentials,
  new dependencies, or usage beacons from the review surface.
- Home with three just-aired episodes and one card per current program key.
- Show/episode result counts, category and scope controls; normalized text ranking
  over primary metadata. Show descriptions find shows without labeling all their
  recordings as topic matches. “jazz” currently returns four shows and no episode
  matches. Exact show-name matches precede weaker descriptive matches.
- Grouped episode previews, three per group, with all-matching-episodes action.
- Show detail with description and available episodes; compact episode dialog
  with show navigation, date/time, real episode notes or an honest missing state.
- Responsive light/dark layouts, native modal focus behavior, Escape/Back,
  query URLs and a persistent native audio player. Audio starts only on Play.

## Review sequence

1. Home: hierarchy, artwork size, just-aired section and directory.
2. Search “Democracy Now”: show first, secondary descriptive match, compact episode
   previews, then all matching episodes.
3. Search “jazz” and “housing”: distinction between show context and episode topic.
4. Open a show, select a broadcast and compare desktop with a narrow phone window.
5. Play, reopen details, switch show/episode context, and close; judge the player
   and modal relationship. Try theme switching, categories and a nonsense query.

## Verification performed

Chrome rendered the updated version-stamped assets; fetched review asset bytes
matched local files and HTML X-App-Version matched `/healthz`.
25 browser checks passed: those freshness checks, grouped preview/all matches,
opening dialog, Escape with query preserved, jazz matches, empty state/reset,
no page overflow at 360/390/560/768/1280px in both themes, and dialog fitting each
viewport. No JS exceptions in initial interaction probe. Screenshots inspected
for desktop home/search and mobile episode modal.

Additional real interaction check: grouped “Show more episodes” enters the full
list; Play loaded an actual archive recording, currentTime advanced beyond three
seconds with readyState 4, and playback continued while opening the show view
with 69 available Democracy Now episodes. Test playback was stopped afterward.
Browser processes used for verification are closed; local app server is left
running for Paul. No real-device listening/accessibility audit yet.

## Prototype boundaries and next decisions

This is an implementation of the design-review phase, not completion of core
phases 1–3 or production integration. Existing app at `/` retains current behavior.
Subsequently packaged as the optional [Discover plugin](discover-plugin.md).
The station flag now gates the page and assets, including `/review.html`.

- Playing from a modal closes it to expose native transport. Decide whether to
  retain that interaction or use the existing in-sheet dock during integration.
- No live-radio/schedule/donation controls in the prototype. Preserve the existing
  product's controls when integrating approved layouts.
- No new canonical production routes, server share previews, copy/share actions,
  or stored listening progress in this surface. Theme persistence was subsequently
  added with Discover packaging.
- Multi-part programs remain distinct pending an authoritative grouping map.
- The directory includes programs with available recordings; no-recording scheduled
  programs need a defined presentation during the core model phase.
- Search uses simple client-side ranking, not the final precomputed index. It
  does not claim typo correction or complete topic coverage. Broader keyword
  match explanations and pagination/focus polish belong to phase 3a.
- Native dialog handles focus trapping; full touch scrolling, screen-reader,
  zoom, nested navigation and real-phone checks remain production acceptance work.

Next: Paul's visual/interaction feedback, then implement approved core phases
incrementally. Keep all QIR work separate; access is still pending.
