# Cross-platform discovery module — planned 2026-09-23

The web podcast template and its Flutter sister app share a core product boundary:
catalog, ordinary show/episode search, playback and station identity work without
the advanced discovery provider. The standalone discovery app in
`/Users/paulhenshaw/Desktop/kpfk-discovery-plugin` remains independently developed
and deployed. It is the KPFK beta for Ace's changing VPS API, transcripts,
timestamp cues and advanced search. No live QIR authentication has been verified.

## Intended integration

- Web and Flutter each get an optional discovery module with a station-level
  enable switch. The existing web `plugins.discovery` flag is only an embedded
  snapshot toggle; it is not a completed integration of the standalone app.
- Give each station its own provider configuration, credentials and feature
  availability. Store secrets server-side. Do not hard-code Ace's host or API
  shape into the shared core or ship credentials in Flutter.
- Put provider-specific HTTP, schema mapping, errors and version handling behind
  a narrow adapter. A moved endpoint or changed API should require adapter or
  standalone-app work, not a catalog/player rewrite for each station.
- Keep the standalone app useful on its own and let web/mobile consume only
  capabilities validated for each platform. Native Flutter discovery screens
  should fit phone/tablet interaction rather than copy desktop markup.
- Disabled, unsupported, unconfigured or unavailable discovery must leave core
  search, browsing and playback intact. Show a clear provider status only inside
  the optional experience; avoid claiming transcript coverage where none exists.
- For station cloning, default the module off until that station has a verified
  provider contract and isolated configuration. The planned admin station setup
  should expose enablement/status, not arbitrary plugin-code installation.

## Implementation sequence

1. Verify the QIR contract, authentication, identifiers, transcript/marker format,
   rights, availability and failure modes against the real service.
2. Define a versioned adapter/capability contract and per-station configuration.
   Keep ordinary core search independent in both apps.
3. Pilot the optional web integration in KPFK, with on/off and provider-outage
   checks. Preserve standalone deployment and its own release path.
4. Build the Flutter module behind the same station-level capability decision,
   with native discovery, transcript search and timestamp seek only for verified
   provider features. Test disabled/unavailable states, offline core browsing,
   phone/tablet layouts and actual playback.
5. After KPFK beta, decide which general UX belongs in the Pacifica template and
   which provider-specific functions stay in discovery. Enable another station
   only after its adapter/configuration is verified.

Status: architecture plan only. No new Flutter module, cross-app adapter contract,
admin toggle or production connection was built by this documentation change.
