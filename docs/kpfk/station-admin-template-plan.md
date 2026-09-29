# Station setup and reusable template — planned 2026-09-23

> ## Status — 2026-09-29 (built, parked; next work is the listener site)
>
> **Built (studio → Discovery & settings → Station & appearance).** Anyone signed in to the studio.
> Summary cards (Station · Side-menu links · Social accounts), one edit panel per card, a draft bar
> ("N changes not yet on the site · Discard · Review & publish"), Undo last publish.
> - Editable: name, frequency, city, logo upload (PNG/JPEG/WebP by content, 1 MB, content-hashed,
>   served at `/station-assets/`), every side-menu link, every social account.
> - How: overrides on the data volume (`data/station/`), laid over `stations/<id>.json` and passed
>   through the same `validateProfile()` (`lib/station-overrides.js`). Live at once, no restart;
>   `station` is read per request (the Donate/Privacy frame-src and link-preview defaults too).
> - In the full backup (`settings.station`, logo included); restore checks the edits against the
>   target's install settings; undo reverses. Tests: `test/pacifica/station-edits.test.js`
>   (every place the station is shown updates; a boot-time copy fails it), browser
>   `test/studio/station-tests.js`.
> - **Data sources card: read-only placeholders** — catalog and channels feeds, live stream, site
>   address, time zone, station ID, allowed hosts. Marked "Not editable yet".
>
> **Next, in order (not started):**
> 1. **Feeds editable with a test before switching.** Decision needed first: apply on restart, or
>    rebuild the feed reader live (`lib/pacifica/service.js` is created at boot with the profile).
>    Fetch + normalise the proposed catalog/channels, show counts, then switch; keep last-good.
>    Needs a second station's feed to test against. Allowed hosts follow the feed addresses.
> 2. **Live stream** (validated audio origin; a short live probe before switching).
> 3. **Time zone** (moves schedule and reports; DST tests).
> 4. **Colour** — built and removed 2026-09-29 (Paul: "for now"); design and code in commit
>    `404816e` (`lib/station-colors.js`: one brand colour, WCAG AA per theme, `/station.css`).
> 5. **Other images**: placeholder artwork, app/touch icons, share card.
> 6. New-station launch workflow and pilot (phases 5 and 7 below).

Explicit request from Paul: add an admin interface that makes this app a reusable
station template, with a different JSON feed, uploaded station images and editable
text so new stations can launch rapidly. This supersedes the earlier hold on
planning station settings. Implementation follows the KPFK fixes/plugin beta;
it is not part of the current plugin build.

## Proposed phases

1. **Settings contract and persistence.** Station profile supplies defaults;
   validated overrides on DATA_DIR supply editable values. Define precedence,
   schema version, export/backup/restore, audit of settings changes and rollback.
   Keep credentials separate, server-side, and absent from public settings exports.
2. **Admin station setup.** Identity (name, call letters, frequency, city, timezone),
   catalog/channel feed addresses, stream, links/social, categories, editable home
   introduction/tagline and other explicitly supported copy. JSON must implement
   a supported provider contract: a different URL alone cannot adapt any arbitrary
   feed schema. Show an actionable compatibility report and require an adapter for
   unsupported schemas. Preview branding and sample data before publishing.
3. **Image uploads.** Logo, station placeholder, app/touch icons, share image;
   previews, replace/reset, crop/fit guidance and clear size requirements. Store
   uploads on the persistent volume with atomic replacement, type/size validation,
   sanitized filenames and last-good references. Decide raster conversion/resizing
   dependencies deliberately. Preserve source-owned show artwork rules separately.
4. **Safe apply and rollback.** Authenticate admin actions, protect writes with CSRF,
   validate allowed feed/media origins and reject private-network/metadata targets,
   warm and verify proposed feeds before switching, expose status without secrets,
   restore prior settings on failed application. User-entered text is escaped;
   do not expose arbitrary HTML/code editing. Test timezone and DST effects.
5. **New-station launch workflow.** Create a fresh station deployment/profile/data
   volume, preview configuration, run readiness checks, then activate. Export a
   portable settings package and import into a new station with explicit mapping.
   Do not relabel a populated KPFK data volume as another station or mix its usage,
   caches, resume keys or plugin credentials. Define which values are mutable on
   an existing station and which require a fresh deployment.
6. **Plugin settings.** Station-level enablement, connection state, provider scope
   and server-side credential management. QIR initially remains KPFK-only; adding
   other stations requires verified provider support and isolated configuration.
   The web and Flutter apps share the enablement decision, but each integrates an
   optional platform-appropriate discovery module. The standalone discovery app
   remains separately deployable. See [cross-platform module plan](cross-platform-discovery-module.md).
7. **Pilot and documentation.** Launch a second supported station from a fresh
   template without editing shared source; verify feeds, images, text, schedule,
   playback, exports, settings restore and failed-change rollback. Use results to
   finalize launch guide and realistic setup time.

## Acceptance gates

- A new supported station can be configured in admin without source-code edits.
- Invalid feeds/images/text cannot replace a working configuration.
- Uploaded assets and settings survive restart/redeployment and portable restore.
- Changes have an explicit preview/apply step, visible status and a rollback path.
- Existing station data and statistics retain their station identity.
- Default global UI and optional plugin features are recorded separately after
  the KPFK beta decisions; no assumption that the whole prototype is already the
  permanent shared template.

## Decisions still needed at implementation time

Deployment model (initial recommendation: one deployment/data volume per station,
not a multi-tenant rewrite), editable copy list, branding image pipeline, who can
publish changes, hostname/DNS/deployment provisioning boundary, and which JSON
provider contracts the first station-setup release supports. Admin configuration
does not itself provision servers or DNS unless separately scoped.
