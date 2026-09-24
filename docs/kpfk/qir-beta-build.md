# QIR beta foundation — 2026-09-23

Status: implemented locally; **not connected to live QIR**. The user clarified
that Discover is first the KPFK API demonstration/beta, with selective later
adoption into the global Pacifica template. Main-app fixes remain independent.

## Running now

http://localhost:8081/discover — approved layout, with an explicit source selector:

- Station archive preview: real existing feed; labeled as non-QIR content.
- QIR API beta: server adapter to the documented QIR API. With no key installed,
  this correctly displays connection pending rather than substituting archive data.

Runtime server variable: `QIR_API_KEY`. It stays on the server, outside station
JSON/public profile and browser assets. Node does not automatically load .env.
The adapter is enabled only for station `kpfk` with `plugins.discovery: true`.
No key was recovered or supplied during this session. Do not paste one into docs.

Same-origin routes:

- `/api/plugins/qir/status`: configured/verified/unavailable state, last successful
  catalog time, chaptersSupported:false. No credentials or provider response bodies.
- `/api/plugins/qir/catalog`: QIR episode/show data with provider UUIDs intact.
- `/api/plugins/qir/transcript/<public_id>`: bounded JSON transcript/VTT for an
  episode known to the fetched QIR catalog. Missing transcript remains HTTP 404.

No imports of Ace's processor. This consumer module lives in the app server for
now; it is isolated code, not a separately deployed service/process. A separate
consumer deployment remains possible if beta operational needs justify it.

## Implemented behavior

QIR mode uses QIR headline, summary, host and guest for episode display/search,
with air-date range and category filters. Archive and QIR rows are never merged
by guessed title/date/MP3 matches. Internal QIR UI IDs are namespaced separately.
The exact primary-catalog identity mapping is still required before enriching core
archive records or using the main player/resume IDs with QIR records.

On demand, QIR episodes offer transcript loading, local text search within that
transcript, speaker labels when present, and clickable cue timestamps. VTT is
parsed into plain text/times; provider markup is not injected as HTML. Timing is
validated against supplied duration. A timestamp action loads audio metadata,
seeks and plays. Plain-text-only transcripts remain readable/searchable without
invented timings. Rendered transcript matches are bounded to the first 200, with
an explicit narrow-search message for longer cue lists.

These cues are **transcript timestamps, not editorial chapter markers**. No
chapter schema/endpoint was supplied. Global full-transcript indexing and semantic
search are not implemented; current global QIR search is metadata-based. In-episode
transcript search only searches the transcript explicitly loaded by the listener.

## Adapter limits and resilience

Fixed HTTPS QIR origin; no credential-bearing redirects. Requests serialized at
least 1.1 seconds apart, bounded response bytes/time, safe audio-origin checks,
opaque cursor handling, duplicate-ID upsert and repeated-cursor rejection.
Cold catalog backfill is all-or-nothing, capped at 25 pages × 200 records and 16MB
combined payload. If exceeded, stop with a beta-limit error rather than silently
publish an incomplete catalog.

One-hour in-memory catalog cache, bounded transcript cache (30), concurrent request
deduplication, 429/backoff and explicit stale last-good catalog on refresh failure.
Current iteration uses a full traversal when the cache expires. Durable snapshots,
incremental watermark sync, ETags and distributed/process-wide rate coordination
are later production-readiness tasks. A restart loses the plugin cache but not
core archive data. Multi-instance deployments are not supported by this limiter.

The prototype has its own native player. Crossing to the main app is a page
navigation and does not transfer playback. Show artwork uses station fallback
in QIR mode; it is not guessed from primary-catalog titles. QIR's `show_group`
is retained as source data but not used to invent permanent show identities.

## Verification

Full `npm test` passed: inherited suites and 50 Pacifica tests, including seven
initial QIR tests. An additional date/time validation case was then added; the
eight-test QIR suite passed. Coverage includes no-key/disabled no-network behavior,
pagination/upsert, secret exclusion, cache/deduplication, stale/backoff, redirects,
unsafe audio origins, repeated cursors, missing transcripts, VTT timing/speakers,
and impossible dates/times.

Nine browser checks passed: genuine archive-preview/missing-key states, then
controlled browser-only API responses for QIR summary search, transcript load,
cue filtering, mobile layout, timestamp seek/play and air-date filtering. The seek
used real archive audio and advanced playback. No runtime exceptions. Test
interception was removed afterward; **sample content was never installed into the
running app or represented as live QIR evidence**. Mobile screenshot inspected.

## Next beta gates

1. Install a working key through the secure runtime channel; verify real shapes,
   catalog scope, identities, nullable data, transcript coverage and access policy.
2. Establish supported marker format and meaning, corrections/deletions, audio
   revision alignment, approved public display/distribution and source identities.
3. Iterate plugin UI/search with Ace and Paul; explicitly record each decision to
   promote a feature into the global template or retain it only in the plugin.
4. Add durable sync, correction/removal handling, freshness, long transcripts,
   full indexing strategy and keyboard/phone acceptance before KPFK production.
5. Only then evaluate other stations, separately from the
   [admin station-template setup plan](station-admin-template-plan.md).

No production deployment or client email sent.
