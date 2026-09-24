# Station setup and reusable template — planned 2026-09-23

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
