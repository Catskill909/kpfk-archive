# Client feedback review and phased plan — 2026-09-23

**Project status (2026-09-23):** local implementation in progress. Nothing from
these phases has been deployed to the live archive. This plan covers Ace's four
annotated screenshots, core search and layout, and the optional discovery/API
work. The screenshots are feedback, not proof that every proposed behavior is
already in the product.

## Start here — done, next, and waiting

| Area | Status | What to review or do next |
| --- | --- | --- |
| Feedback audit and API document review | Done for available evidence | Recheck assumptions against authenticated provider examples; see [API review](qir-api-review-2026-09-23.md) |
| Design concept | Prototype built locally | Review [prototype](phase-0b-review.md) at `http://localhost:8081/review.html`; it is a reference, not the finished homepage |
| Core copy and search | Implemented locally, not released | Review `http://localhost:8081/?q=jazz` and `?q=democracy%20now`; [implementation evidence](core-search-phase.md). Ordinary search works independently of QIR |
| Homepage, show view, routes, multi-part grouping | Planned | Build one-card-per-show directory and show navigation; confirm authoritative mapping before combining multi-hour broadcasts |
| Episode/show modal layout | Planned | Prototype and implement the desktop/mobile content hierarchy and styling; verify navigation and playback |
| Separate discovery app | Working local beta; no live QIR verification | Review `http://127.0.0.1:8082/`; its [private standalone repository](https://github.com/pacifica-foundation/kpfk-discovery-plugin) owns future plugin work |
| Provider integration | Waiting on working credentials and real payloads | Verify IDs, transcript coverage, timestamp semantics, permissions and failure behavior before production integration |
| Release and station admin | Planned | Test completed core phases before deployment; [station setup](station-admin-template-plan.md) follows the KPFK beta |

**Next execution order:** (1) review the locally implemented core search and the
home/show/modal prototype; (2) build the one-card-per-show homepage, show view and
episode layout in the main app, keeping the existing player and API compatible;
(3) validate Ace's real API when credentials arrive and continue the separate
discovery beta; (4) run desktop/mobile, playback and link checks before release.
The standalone discovery beta can advance alongside core work. Neither provider
access nor the plugin blocks the homepage and modal fixes.

**Where to work:** the main web archive is this repository on port 8081;
`/Users/paulhenshaw/Desktop/kpfk-discovery-plugin` is the separate app on 8082;
`/Users/paulhenshaw/Desktop/kpfk-podcast` is the Flutter sister app. The Flutter
core-search adaptation and optional discovery module are planned separately; see
[cross-platform module plan](cross-platform-discovery-module.md).

Scope reviewed: four annotated screenshots, README/HANDOFF, front-end
search/sheet/history, Pacifica normalization/service, station configuration and
server share previews.

## Current product direction — clarified by Paul

The preferred design is the KPFK beta plugin experience demonstrating Ace's
VPS-hosted QIR service: summaries, transcripts, markers when supported, advanced
search and clear results. It is not merely a second core archive skin. Existing
archive data can support an explicitly labeled preview while API access is
pending. No production connection or chapter contract has been verified yet.

Prioritize core fixes and getting the plugin working. Decide phase by phase which
UI/search features are adopted into the shared Pacifica template and which remain
plugin-specific. Do not automatically promote the entire prototype into core.
KPFK beta → KPFK production acceptance → later scaling assessment.

Paul also requested a later [admin station-template setup](station-admin-template-plan.md)
phase: JSON feeds, image uploads, editable text and station/plugin configuration.

## API attachment received after the initial review

The user supplied `KPFK-QIR-API.md`: a useful read-only API specification now
exists. See [QIR attachment review](qir-api-review-2026-09-23.md) for documented
capabilities, public health evidence and remaining contract gaps. Base URL is now
known; authenticated access is pending. This supersedes earlier pending-URL and
no-spec assumptions, without changing the independent core search requirement.

## Evidence and limits

Read the public `/api/archive` and `/api/showinfo` at https://podcast.kpfk.org
on 2026-09-23. Current archive: **1,017 episodes, 99 distinct program IDs**;
schedule filter hides 142 of 1,159 catalog episodes. Counts are time-sensitive.
Current source was inspected locally; deployed JavaScript was not byte-compared.
Search counts below reproduce the local search predicate on current API data;
they are not a browser interaction test. No mobile render or playback audit was
performed. Screenshot 4 is desktop; mobile findings below are code observations
and design proposals, not measured mobile defects.

| Client observation/proposal | Finding | Disposition |
| --- | --- | --- |
| Homepage counts episodes as shows | Confirmed: `render()` counts episode rows but emits “shows found” | Immediate copy correction; separate show directory afterward |
| “Latest show” means latest episode | Confirmed in `setClock()` | Rename while preserving the separate last-checked state |
| Search likely matches titles only | Incorrect: title + mapped category label + host, substring matching | Document actual fields; expand from existing metadata |
| “jazz” / “housing” suggested but empty | Current predicate returns 0 for both; Democracy Now returns 69 episodes | Remove misleading examples first; add truthful richer search |
| Descriptions/topics could improve search | Existing directory descriptions and normalized episode metadata are available | A trial combined text search finds jazz in 8 episodes/4 programs and housing in 1 episode/1 program; not proof of comprehensive topic coverage |
| One card per show; show first in search | Current data already has stable `sho` keys | Good core product change, independent of enrichment |
| Six Something's Happening tiles should collapse | Six separate program IDs exist upstream, with A/B and hour labels | Explicit station grouping map or upstream relationship required; never infer identity by stripping words from titles |
| Generic art and casing are upstream issues | Catalog supplies names/art; existing policy deliberately accepts generic art | Keep feed artwork; request editorial corrections rather than silently overriding |
| Episode links use `?show=` | Confirmed: parameter contains episode ID; both browser and server share preview depend on it | Add separate canonical show/episode routes with legacy compatibility |
| Show name should navigate to show | Current sheet heading is plain text | Add an explicit route to the show and available episodes |
| Past episodes count is only 8 | `episodesFor()` lists all matching playable rows, no cap; live Pocho feed has 8, July 31–September 18 | Say “8 available episodes”; upstream retention/publication cause remains unconfirmed |
| Episode sheet repeats show description | `sheetHtml()` reads directory prose, not `episodeDesc` | Separate show context from episode content |
| Episode titles/guests/topics absent | Adapter already produces `episodeTitle`, `episodeDesc`, `published`; current sheet ignores them | Use existing metadata first; only 26 live episodes have descriptions and 25 have topics |
| AI summaries are already in Confessor | Not established by screenshots or these APIs | Verify exact published endpoint, fields, provenance and coverage before planning a dependency |
| Pocho category is too coarse | Raw feed says “Public Affairs - Local”; local map displays “Public Affairs” | Station editorial decision; comedy can coexist with public-affairs classification |
| Add subscribe/RSS | `SHOW_RSS=false` is explicit policy; JSON adapter sets no RSS URL | Separate product decision, not an incidental styling fix |

All 1,017 rows have `vtiUrl` (example shape: `/cue/<id>.vti`). A URL's presence
proves neither its contents nor availability, transcript coverage, format, or any
relationship to the proposed external service. Do not equate it with working AI
integration. Inspect only once the source/interface scope is established.

## Implementation checkpoint — QIR beta foundation

[Current beta build](qir-beta-build.md): separate source modes, server-side API
adapter and transcript search/timestamp playback implemented and tested with
controlled responses. Live credentials/verification, editorial markers, durable
incremental sync and global transcript indexing remain outstanding. This is not
completion of phase 4 or production readiness.

## Proposed product structure

Home: compact “Just aired” area plus one card per eligible show, each with latest
available date. Retain the scheduled-program policy, live radio, and published
schedule. A directory needs an explicit treatment for scheduled shows with no
recordings; do not expose every unscheduled catalog entry accidentally.

Show view: artwork, name, host, show description, website and available episodes
newest first. Episode rows emphasize episode title or an honest dated-broadcast
fallback, air time and duration. Distinguish broadcasts on the same day.

Episode view: show link, episode title/date/time, Play, episode-specific description
and published guests/topics. Keep show biography secondary and labeled. Missing
metadata should produce a concise date-based view, not invented episode copy.
Search should distinguish show matches from episode-content matches and label
counts separately. Precompute searchable strings when feed/directory data updates;
do not concatenate long descriptions on every keystroke. Preserve category/query
URLs and announce results accessibly. Keep search terms local as today.

Suggested route identities: `/shows/<stable-show-key>` and
`/episodes/<stable-episode-id>`, optionally decorated with readable slugs. Date-only
routes in the annotation can collide for repeat broadcasts or parts. Existing
`?show=<episode-id>` links must continue to resolve. Handle reload, back/forward,
share previews on the server, unavailable recordings, and station-local dates.
Route changes must not alter `/api/archive` identities consumed by the Flutter app.

## Core search experience — explicit requirement from Paul

Paul confirmed on 2026-09-23: a smart, modern, clean search experience is part of
core product scope, regardless of whether the audio/enrichment plugin is used.
This is a dedicated design and implementation phase, not a plugin deliverable.

Proposed presentation for review:

- One search field with clear/reset and a concise scope hint. Preserve query in
  the URL and retain results/scroll position when returning from a show or episode.
- Clearly labeled Shows and Episodes sections with separate counts; offer All,
  Shows and Episodes scopes when useful. Avoid a mixed grid of identical artwork.
- Show-name queries lead with a compact show result: artwork, name, host, short
  description and latest available episode. Opening it leads to the show view.
- Episode results use compact rows: distinct episode title or dated-broadcast
  fallback, show name, air date/time, duration, short relevant text excerpt and
  explicit Play action. Use small artwork as context, not a repeated full-size tile.
- In All results, group episode previews under their show with a clear “View all
  matching episodes” action; in Episodes scope show a paginated ranked list with
  show identity on every row. Do not nest a long episode grid inside each show.
- Rank exact show-name matches first, then name prefixes/words, then episode
  title/topic and other metadata matches. Use recency as a tie-breaker, not the
  only relevance rule. Normalize punctuation/spacing and accents; defer typo
  tolerance until representative query testing establishes its value.
- Match context explains why an episode appears. A show-description match should
  primarily surface the show, rather than pretending every episode discusses the
  queried topic. The broad-text counts earlier in this review demonstrate available
  data only; they are not the proposed final ranking or episode-topic semantics.
- Empty state repeats the query safely, explains active filters, offers clear
  filters/reset and browsing paths. Never promise topics absent from metadata or
  invent suggested results. Loading, no match and feed failure look different.
- Desktop uses readable horizontal rows and restrained spacing; mobile stacks
  the same information with wrapping titles and reachable controls. Avoid dense
  chip collections, horizontal result scrolling and duplicate play controls.

Core index: show name, host, category and show descriptions; episode title,
published topics, guests and notes. Optional enrichment can add attributed
matches, but absence/failure must not degrade the core layout or available search.
Build the core index before optional enrichment and separate field provenance.

Search phase acceptance: review desktop/mobile prototypes for exact show query,
topic query, partial name, multiple matching shows, no results, restrictive
category and missing descriptions. Implement deterministic relevance fixtures,
separate show/episode totals, accessible result announcements and keyboard focus,
query/category/back restoration and incremental result loading. Verify the full
set with the plugin disabled and with a failed provider. No remote search-query
logging; preserve the current privacy behavior.

## Modal design brief

Desktop: clear show context at the top, episode heading and date next, primary
play action immediately discoverable, content below. Use a restrained artwork
size so the identity and action outweigh the image. Show description belongs
primarily in the show view. Use one scrollable content region and a stable player
area; avoid separate nested scroll areas for every content section.

Mobile: prototype a compact artwork-and-title header rather than the current
centered vertical art stack (CSS breakpoint 560px). Keep primary action reachable,
respect safe areas and dynamic viewport height, and test long titles and expanded
text. Compare the existing bottom sheet with a full-height episode surface before
choosing. Transcripts should not force an unbounded dialog or hide transport.

Preserve existing focus trap/return, Escape, inert background, body scroll lock,
back-button dismissal, schedule-to-sheet return and live/archive player ownership.
The current sheet can display a different episode while another plays; retain an
unambiguous distinction between selected and playing content. Closing/minimizing
must not unexpectedly stop playback. Retain existing theme treatment while
reviewing both explicit and OS-selected light/dark modes.

## Phases and acceptance gates

“Local” means implemented in the working tree, not committed or deployed. A phase
is complete only when its exit evidence is met; early code does not close it.

| Phase | State | Remaining work / exit evidence |
| --- | --- | --- |
| 0 — Baseline and decisions | Reviewed; provider validation open | Feedback and supplied QIR document mapped to evidence. Verify authenticated examples and unresolved editorial decisions |
| 0b — Shared UX prototypes | Prototype built; review open | Review home, search, show and episode hierarchy on desktop/mobile, including exact/topic/empty queries, long titles and player state |
| 1 — Truthful current UI | Local copy fixes; release open | Episode counts, freshness, loading and empty labels must match real data; finish accessibility review and release checks |
| 2 — Core information model | Planned | One card per show, show view, Just aired, distinct episode view and stable routes; keep legacy links and API identities working |
| 3a — Core search | Local implementation; release open | [Evidence](core-search-phase.md): show/episode separation, metadata ranking and context tested locally. Review UI, accessibility and production release behavior with plugin disabled |
| 3b — Modal layout | Planned | Implement show/episode content and styling; verify at 360, 390, 560, 768 and 1280px, short landscape, larger text, keyboard, both themes and playback |
| 4 — Separate provider beta | Standalone local app; live API validation open | Verify authenticated IDs, transcripts, timestamps, failures and rights against the real provider; editorial chapters require a documented contract |
| 5 — Controlled optional integration | Planned | Versioned adapter, per-station enablement and health; provider outage/disable leaves core intact. Flutter module is also planned, not built |
| 6 — Release verification | Planned | Adapt affected tests, check desktop/mobile playback and links, deploy core changes independently, audit live version and rollback |
| 7 — Admin station template | Planned for later | Validated feeds, branding, editable copy, preview/rollback and plugin controls; launch a second station without shared source edits |

Additional milestones tracked separately from the main sequence:

- **Multi-part shows:** after an authoritative mapping, present a single program
  identity and explicitly ordered broadcast parts, retaining original episode IDs
  and links. Define broadcast-day boundaries before joining overnight parts.
  Missing parts remain visible as incomplete availability. Audio concatenation
  and automatic continuous playback require separate scope.
- **Upstream editorial follow-up:** artwork, title casing, classification and
  archive retention questions go to source owners; record outcomes rather than
  treating them as front-end defects. Do not send messages automatically.
- **Client email:** after core designs and API findings are concrete, draft a
  client-facing note describing phases, remaining inputs and who maintains the
  provider versus the adapter. Keep candid discussion in ignored local notes.
  Delivery is a separate explicit action after the draft is reviewed; no email
  has been sent.

Current checkpoint: investigation is complete for available evidence. Phase 0b
is awaiting visual review. Phase 1 copy fixes and phase 3a search are implemented
locally, with [search evidence](core-search-phase.md); they are not released.
Homepage/model and modal integration, authenticated API validation and release
checks remain pending. Credentials block live provider testing only.

Phase 4 discovery can proceed alongside phases 1–3. Core UX work must not wait for
external transcript availability. Style prototypes can start before routing is
complete once the show/episode content hierarchy is agreed. Multi-part grouping
is its own milestone after an authoritative map; merging audio or adding continuous
part playback is additional scope, not implied by deduplicating cards.

Before releasing client changes, verify served asset versions per CLAUDE.md.
Adapt affected inherited WBAI browser tests to KPFK assumptions. Test actual
keyboard/touch effects, deep links/share metadata and player continuity. Use a
real phone for archive/live checks after player-affecting changes. Run existing
offline suites when implementing; no code tests are claimed for this document-only
review. Deploy and check live state separately from local success.

## Optional enrichment architecture proposal

Keep Pacifica catalog/audio as the core source. Use a separate service/application
to inspect and normalize external enrichment, then a small app-owned adapter to
consume a bounded versioned contract. Start with one provider; defer a generic
plugin marketplace or arbitrary executable plugin loader.

The standalone viewer should consume existing output first. Running audio
processing ourselves is a separate decision requiring an explicit processing
specification, deployment and support scope.

Minimum contract to establish with sample fixtures:

- Schema version, provider ID, station ID, exact upstream episode/source identity,
  audio revision or fingerprint, generated/updated times, processing state and
  revision. Never join by title/date alone or across station boundaries.
- Optional summary, language, transcript segments with time units, chapter markers,
  and provenance/review status. Missing, processing, failed, stale and complete
  must be distinct. Define timestamp origin for multi-part audio.
- Validation for types, size, finite ordered timestamps within the recording,
  duplicate revisions, stale updates, corrections and deleted/expired recordings.
- Authentication, endpoint ownership, polling/rate limits, version changes and
  representative success/empty/error payloads. Keep credentials server-side.
- Bounded requests, timeouts/backoff, last-good storage with visible freshness,
  independent cache and station-scoped configuration. No provider request on the
  critical playback path. Render text safely; do not execute provider HTML/scripts.
- Provider outage or disabled plugin leaves normal catalog, search, schedule and
  playback usable. Decide explicitly whether stale enrichment is retained or hidden.

Core maintainer owns app/adapter behavior; provider operator owns processing,
service uptime and output format; station editorial staff own content review and
correction decisions. Confirm these responsibilities with the parties before a
production pilot. A deployment boundary alone is not a support agreement.

Initially use a profile flag. A persistent studio switch needs the settings
precedence, validation and storage work already on hold in HANDOFF; it should not
quietly introduce a second configuration system. Reuse the pattern for other
stations rather than embedding KPFK URLs or assumptions into shared UI.

## Pending inputs and decisions

1. Working API credentials and representative authenticated outputs. The supplied
   specification describes a read-only feed; verify identity mapping, correction/
   removal behavior and transcript coverage. Do not assume processor takeover.
2. Review the prototype's desktop/mobile home, search, show and episode surfaces
   together before structural implementation or styling.
3. Confirm upstream retention explanation, authoritative part grouping and category
   edits with the relevant source owners. Preserve current policies until changed.
4. Resolve routing and provider contract details before estimating the remaining
   integration work from screenshots alone.

A later client communication should explain the concrete agreed plan and
integration responsibilities after the service review. None has been sent.
