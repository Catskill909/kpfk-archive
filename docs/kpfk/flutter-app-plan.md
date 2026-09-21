# KPFK Flutter podcast app — scope and phases

Planning baseline: 2026-09-21. **The retrofit described here was implemented the same day**
in the clone at `~/Desktop/kpfk-podcast` (analyzer clean, 21 tests, Android emulator
verified, unsigned iOS build). This document keeps the scope decisions and the
before/after mapping; live status, evidence and remaining release checks live in that
clone's own `HANDOFF.md`.

## Confirmed direction

- Clone the existing Flutter app at https://github.com/Catskill909/podcast_app.
- Integrate with this KPFK archive web app and retrofit its content loading.
- iOS bundle identifier: **`podcast.pacifica.kpfk`**.
- Android application ID: **`podcast.pacifica.kpfk`**.
- Preserve the existing Flutter listening experience and reusable components.
- **No live radio, no schedule UI, and NO MUSIC SHOWS.** Confirmed by Paul on 2026-09-21.
- This is a plumbing retrofit, not a feature redesign.

Source inspected: Flutter commit `006b5f0a441e329cf03006e373dca3297083d813`; KPFK commit `8ef1fc4`. Flutter was downloaded to a temporary review checkout, not established as the implementation project. Source inspection confirms components exist, not that builds or device behavior pass. The source README mixes historical and current claims; implementation and fresh tests take precedence.

## Recommended architecture

```text
Pacifica JSON feeds
        ↓
Existing KPFK server: validation, scheduled-program filtering,
last-good snapshots, metadata joins and artwork proxy
        ↓ public HTTPS JSON APIs
Flutter KPFK repository / model adapter
        ↓
Existing Flutter screens, player, favorites and downloads

Audio: Flutter → published Pacifica media URLs directly
```

Use `https://podcast.kpfk.org` as a configurable API base. Confirmed by Paul on 2026-09-21. It gives both clients the same archive policy without duplicating Pacifica normalization in Dart. It also makes the KPFK server a mobile metadata dependency; device caching and server last-good snapshots cover different outage cases.

Do not generate RSS to satisfy the old parser or scrape missing metadata. Replace the XML entry points with a JSON repository. No new server endpoint appears necessary for the first archive milestone; verify the contract before deciding otherwise.

The native release targets are iOS and Android. Flutter web support, its proxy, and any CORS changes are outside the initial release scope.

## What the source retrofit actually touches

| Area | Inspected source | Planned treatment |
| --- | --- | --- |
| Program directory | `lib/core/services/directory_feed_service.dart` reads XML from `podcast.supersoul.top/feed.php` | Build cards from accepted KPFK archive groups, enriched with show metadata |
| Episodes | `lib/core/services/podcast_api_service.dart` parses RSS; URL loading derives podcast ID from `feedUrl.hashCode` | Fetch archive JSON once per refresh and group by canonical show key |
| Card navigation | `lib/ui/widgets/directory_grid.dart` calls `fetchPodcastFromUrl` | Load program by show key |
| Detail refresh and favorite navigation | `podcast_detail_screen.dart`, `home_screen.dart` retain feed-URL loading paths | Route all entry points through the KPFK repository |
| Persisted models | `Podcast`, `Episode`, `DirectoryPodcast`, favorites and generated Hive adapters | Preserve field numbering; add explicit show identity where needed; do not masquerade an API URL as an RSS feed |
| Playback and offline state | Audio handler/provider, downloads, last-played, progress, availability services | Reuse and verify with canonical IDs and KPFK audio |
| Branding/configuration | App assets, native projects, feed config and menu features | KPFK identity and links; remove unrelated station entry points from this clone's navigation |

Keep a separate implementation folder/repository for the clone. The existing podcast app and this web app remain independently releasable. No broad player rewrite or dependency upgrade is included unless baseline verification identifies a concrete blocker.

## Data contract to freeze in phase 1

| Flutter meaning | KPFK source / mapping |
| --- | --- |
| Station identity and public links (never expose or play its stream) | `GET /api/station` |
| Available archive episodes | `GET /api/archive`, whose `shows` property is an **episode array**, additionally restricted to explicit Talk records by the mobile adapter |
| Program identity | Row `sho`, preserved exactly as a string |
| Episode identity | Row `id`, preserved exactly; never use title, index, URL hash or date as identity |
| Program title / host | `title`, `host`; enrich with `/api/showinfo` keyed by show identity |
| Episode title / description | `episodeTitle`, `episodeDesc` |
| Audio URL | `mp3`, used as supplied |
| Artwork | Resolve relative `photo` against API base; retain generic upstream art and blank-art fallback |
| Broadcast date | `dt` is epoch seconds; convert explicitly to Dart milliseconds |
| Duration | `durationSec`; zero means unknown, not a zero-length recording; reconcile with player duration |
| Download size | `bytes` can be null; no fabricated size |
| Freshness | Preserve revision/stale metadata; document seconds versus milliseconds per field |
| Episode web share | `/?show=<encoded episode id>` on the KPFK web base; verify in browser |

The archive response includes its own same-generation directory. The standalone show directory can contain metadata beyond a particular episode listing. It must not independently reintroduce unscheduled programs. Initial archive cards represent groups with available episodes; zero-episode programs are omitted. There is no schedule view in this app. Respect the server's schedule-outage fallback rather than implementing a different filter on device.

Refresh replaces the browsable remote archive after successful validation. Failure retains labeled last-good data. A valid empty result differs from an outage. Favorites, playback history and downloaded files remain separate local records; removing an episode from a successful remote catalog must not erase them. An expiry timestamp alone does not prohibit playback. Local downloaded audio remains playable; actual remote availability failures get a clear state and retry behavior.

## Phases and exit criteria

### Phase 0 — Establish the clone and baseline

Create the dedicated implementation checkout from the recorded source revision. Record Flutter/Dart and native build tooling, run existing analysis/tests, and build baseline development targets. Inventory all active feed loaders, startup defaults, refresh paths and persisted identity references. Apply `podcast.pacifica.kpfk` to Android and every iOS build configuration, checking native activity/package references and any identifier-dependent settings. Set KPFK display name, icons and splash assets.

**Exit:** the clone launches as KPFK on iOS and Android development targets; existing failures are documented separately from retrofit failures. Signed store distribution remains a later milestone.

### Phase 1 — Capture and test the API contract

Capture dated public API responses and representative offline fixtures: archive, show metadata and station profile. Specify the JSON-to-Dart mapping above and the repository operations (list programs, load program, refresh archive, find episode). Check schema handling, relative URLs, stable IDs, timestamps, metadata revision mismatch and response size. Avoid accepting a partially decoded archive as an authoritative empty/deleted catalog.

**Exit:** adapter tests prove correct IDs, grouping, dates, descriptions and artwork, plus valid-empty, malformed-data and outage behavior. Compare the same snapshot's episode IDs against the web API, not a hardcoded count from the handoff.

### Phase 2 — Working archive retrofit

Wire startup, grid, program detail, search/sort, pull-to-refresh, favorites reopening and last-played restoration to the repository. Replace active RSS/feed-URL assumptions. Populate cards and counts from the accepted archive snapshot. Preserve existing player UI, sleep timer and navigation. Use station-profile links for KPFK destinations.

**Exit:** browse → program → episode → play works on both platforms; refresh and all re-entry paths remain KPFK-only. Every episode in an accepted group is reachable, with no artificial age/count cap. Share links open the matching web episode.

### Phase 3 — Persistence and real-device audio

Verify downloads, cancellation, offline playback, favorites, resume after termination, mini-player restoration, sleep timer, seeking, lock-screen controls, Bluetooth/headphone interruptions and background playback. Test changed artwork/metadata, catalog removal, unavailable remote files, restored network access and cached startup. Keep download files/local references separate from disposable feed caches. Exercise existing download-container-path tests and add meaningful JSON/persistence regressions.

**Exit:** an agreed device matrix passes on physical iOS and Android hardware. No duplicate saved records after refresh, no lost download from catalog replacement, and no permanent unavailable flag caused by a transient network failure.

### Phase 4 — Beta and distribution

Audit final app name, icons, native identifiers, public links and privacy text. Confirm developer-account signing and store registrations for the requested identifier. Produce signed beta builds for TestFlight and Android testing, with install/upgrade checks and a retained previous build. Document API base configuration, minimum contract and release procedure in the clone's handoff.

**Exit:** signed beta installs and acceptance checks pass on both platforms; store submission is a separate release action. Registration/signing availability has not been verified during this source review.

## Scope decisions still open

- Should mobile listening contribute to the existing studio counters? Initial recommendation: keep telemetry out of the feed retrofit. Adding it requires explicit mobile event semantics, duration handling, privacy documentation and verification of the existing `/api/ev` request behavior. Fetching the archive does not automatically count mobile listening.
- Native app/universal links can follow verified web sharing; they need domain association and native routing work.
- Working display name is KPFK Podcasts. Clone folder: `/Users/paulhenshaw/Desktop/kpfk-podcast`. A new remote repository and distribution-account details remain release setup work.

No accounts, cross-device synchronization, studio administration UI, new backend database, multi-station browsing or Flutter web release are included in this initial plan. Preserve the source app's local favorites/download capabilities; do not add a new retention policy without a separate decision.

## Review status

Completed: local handoff/readme/rules review, KPFK provider/route inspection, Flutter repository inspection and phased scope.

Completed since initial planning: isolated SDK/dependency setup, source and retrofit analysis/tests, live API contract capture, content-policy audit, KPFK branding and JSON plumbing. Native builds and Android emulator smoke verification have passed. Physical-device testing, signing and store distribution remain outstanding.


## Current audit checkpoint — 2026-09-21

- Clone created at `/Users/paulhenshaw/Desktop/kpfk-podcast` from the recorded source revision. No new GitHub remote has been created or pushed.
- Branding exists and was visually inspected: `public/assets/kpfk-logo.png` (800×180 header) and `public/assets/app_icon_1024.png` (1024×1024 native icon source). No new graphics are required to begin.
- Existing player, background-audio integration, favorites, sleep timer, download manager, offline storage, progress and mini-player code exist. Their presence does not establish device readiness for this clone. Reuse them and verify; do not rebuild them speculatively.
- The source includes a radio/Pacifica-directory navigation entry and placeholder social/contact links. Remove that radio entry and replace placeholder links with KPFK destinations.
- Music policy must check **both episode and program `type`**, plus `cat`/`categoryLabel`. Accept explicit Talk only; exclude Music, missing/unknown classifications and contradictory music categories. No name-based guessing or exception for a talk-sounding title. The pinned source catalog contains Music-typed programs outside the Music category, so a category-only filter is insufficient.
- Enforce eligibility at the repository boundary, and gate playback/download/restoration with persisted eligibility evidence. Successful refreshes can revoke eligibility; an offline failure must not erase previously accepted Talk downloads. Unclassified records are never newly admitted. This is enforcement of the user's content policy, not a claim that feed labels establish recording rights.
- The archive response already contains a same-generation `directory`; use it for classification and metadata joins instead of fetching mismatched revisions from two routes.
- The old handoff hostname returned HTTP 503. **Resolved:** Paul supplied `https://podcast.kpfk.org/`; its archive, station and health APIs are healthy. Do not substitute RSS or ship fixture content as live data.
- Installed Flutter is 3.35.5, while the source lockfile requires Flutter >=3.44.0 / Dart >=3.12.0. An isolated Flutter 3.44.0 SDK is available at `/private/tmp/kpfk-flutter-3.44.0`; locked dependencies installed successfully; the existing SDK is unchanged. Xcode 27.0 and Android SDK platforms through 36 are installed.
- Physical-device checks and signing/store registration remain release verification, not missing app features.


### First plumbing implementation

The clone now uses `KpfkRepository` and `KpfkCatalog` behind the existing service entry points. Grid navigation, detail refresh, favorite/player program navigation and all share actions use canonical identities. The persisted legacy `feedUrl` fields retain their Hive slots but now store show keys; no XML URL is invented. Music/unknown records are rejected; saved eligibility gates playback, restoration, favorites and downloads. Native media-button resume checks the same policy; refreshed revocations stop native audio and cancel in-flight downloads. Successful archive replacement preserves previously approved local Talk records that age out, while revoking records whose current classification disallows them.

KPFK icons/header and native identities are applied. Radio/Pacifica-directory navigation is removed. KPFK social/contact/privacy destinations replace placeholders. Existing app-private downloads no longer request unrelated Android external-storage permission. No changes to the web app runtime or its music-inclusive archive were made.

Validation so far: baseline source analysis and 3 tests passed; after retrofit, analysis and 21 tests passed. The new tests cover real pinned catalog classifications, Music/unknown/missing-program rejection, malformed snapshots, URL restrictions, ID/time/artwork mapping, request coalescing, outage fallback, valid empty generations, revocation and disk restart. Android debug and unsigned iOS release builds pass. No iOS simulator runtimes/devices are currently available on this Mac. The 18:54 UTC 503 was for the obsolete hostname; the corrected production endpoint is verified healthy below.

Correct deployment confirmed: `https://podcast.kpfk.org`. Captured 2026-09-21 archive: 996 episodes, of which 716 across 61 programs satisfy both Talk classifications and the non-Music category rule. 280 episodes across 38 programs are excluded, including 222 Music-typed episodes whose program metadata says Talk. These counts are fixture-specific, not future invariants. The clone now defaults to this deployment.


### Resume checkpoint after usage-limit interruption

The separate Flutter clone now has its own `HANDOFF.md` and updated `README.md`.
Both native builds pass. iOS minimum is 15.0 for the installed Xcode 27 SDK;
CocoaPods integration is retained after automatic Swift Package Manager migration
failed. Existing Oswald/Nunito fonts are bundled with licenses and verified by an
offline widget test. Runtime audit also fixed missing card dates and an inherited
player clock that omitted hours.

Android emulator evidence: live KPFK program/episode screens, advancing native
Talk playback, favorite creation, background media pause, and a complete
115,256,400-byte episode download with artwork. Final upgrade/offline playback
check passed: the saved catalog/favorite/download persisted, local MP3 was selected,
resume position restored, and native playback advanced with networking disabled. No physical iPhone/Android or signing/store verification
has been claimed. Source changes remain local and uncommitted.

Offline UI follow-up: favorite cards now use downloaded artwork; the existing offline banner handles disconnection without a duplicate API-error banner. The final player screenshot confirms `2:00:03` for the long episode.
