# QIR API attachment review — 2026-09-23

Source: user-supplied pasted email containing `KPFK-QIR-API.md`. The API document,
not the Gmail AI summary, supplies the base URL: `https://qir.kpfk.org/api/v1`.
Email credentials and secret-retrieval links are deliberately not reproduced.
This document supersedes the earlier assumption that no specification was available.
The supplied document is a useful initial interface specification; runtime behavior
and integration readiness remain unverified without authenticated access.

## What is documented

- Read-only GET API, server-side Bearer authentication.
- Episodes: cursor pagination, default 50/max 200, inclusive `updated_since`, show
  and local air-date filters; stable provider `public_id` for upserts.
- Episode fields include headline, summary, host, guest, category, local air times,
  duration in minutes and MP3 URL. Several fields are nullable.
- Individual episode detail and optional transcript inclusion; transcript endpoint
  returns plain text and VTT, or raw WebVTT. Missing transcripts return 404.
- Claimed transcript coverage approximately 92%; this is a supplied-document claim,
  not a measured coverage result for our scheduled archive.
- Shows include `key`, `show_group`, display name, category and active state.
  Document instructs grouping by `show_group`, falling back to key, not display name.
- Hourly incremental sync suggested; 60 requests/minute, 429/Retry-After,
  ETag/If-None-Match and 304 support, additive fields, breaking changes via v2.
- Podcast distribution eligibility remains in Confessor, outside this API.

No chapter-marker endpoint or chapter schema is documented. VTT transcript cue
timestamps are not editorial chapter markers. Do not advertise chapters on this
specification alone.

## Public availability check

A credential-free GET to `https://qir.kpfk.org/api/health` during this review
returned HTTP 200 and `status: ok`, with timestamp `2026-09-18T05:45:38.367Z`.
The timestamp precedes this September 23 review. Its meaning is undocumented;
it could be static or represent a different event. This establishes endpoint
reachability only, not current processing, transcript freshness or authenticated
API health. The browser fetch tool could not access the URL; curl returned the
response above. No one-time secret links were opened or consumed. Their expiry
has not been verified. No authenticated API calls were made.

## Integration gaps to resolve

1. **Cross-system episode identity.** QIR public IDs are stable within QIR, but
   existing archive IDs are Pacifica station/source/numeric IDs. The document says
   MP3 URL, title, show and date can change. Request a permanent upstream episode
   ID plus station/archive-source identity, or an explicit mapping endpoint. An
   MP3 match may seed a reviewed mapping; it cannot remain the canonical join.
   Ambiguous/unmatched records must not attach content to a guessed episode.
2. **Show grouping independence.** `show_group` is a useful candidate source, but
   the core directory/search must work without QIR. Establish a stable group ID,
   rename semantics and station-approved mapping in core configuration or the
   primary feed. Verify whether Something's Happening's six keys are actually
   grouped; the Bike Talk example does not establish that.
3. **Corrections and removal.** Specify deleted/unpublished episodes, tombstones,
   rights changes and removed transcripts. Upsert alone cannot remove withdrawn
   content. Define how corrected summaries/transcripts are invalidated.
4. **Transcript revisions.** “Immutable” transcripts and producer corrections
   need clarification: can transcript content change for one public ID, and does
   episode `updated_at` change when a transcript arrives or is corrected? Otherwise
   incremental episode sync can miss transcript changes. Confirm ETag scope.
5. **Time alignment.** Local air time lacks an explicit UTC offset for DST overlap.
   Confirm cue time origin, actual audio duration, replacement audio/version
   identity, multi-part boundaries and speaker-label semantics. Never interpret
   “Speaker 2” as an identified real person.
6. **Sync guarantees.** Confirm cursor lifetime, consistent ordering for tied
   timestamps, changes during pagination and combined cursor/filter behavior.
   Persist page upserts safely; advance durable watermark only after successful
   traversal, replay inclusively and deduplicate by public ID. Bound retries,
   payloads and page counts; handle timeouts and 5xx, not just 429.
7. **Content and access contract.** Confirm provenance/editorial review status,
   language, key scopes and rotation, payload limits, transcript access/distribution
   rules and named operational contacts. Ignore unknown additive fields while
   validating required identity and content fields.

## Revised build recommendation

Proceed with a standalone read-only QIR inspector/viewer once access works. It
should demonstrate pagination, safe local storage, summaries, transcript/VTT
rendering, exact identity mapping and correction/error cases. Consume output;
there is no requirement in this attachment to import or run the audio processor.

Then expose a small normalized enrichment adapter to the core app, optional per
station, with no runtime dependency for basic browsing, search or playback. Keep
keys out of browser code. Preserve Pacifica as the core catalog/audio authority.
Do not expand archive eligibility or enable RSS based on QIR's presence.

Core search uses primary metadata and shows/episodes design regardless of QIR.
QIR may add labeled summary/transcript matches later, with clear provenance and
bounded indexing. It must not be the only source of show grouping or core search.

Next input: renewed API access through the existing secure channel, followed by
representative authenticated payloads and answers on identity, revisions/removals,
and chapters. The planned client email can now acknowledge receipt of a real
specification and focus on these concrete gaps. No email sent.
