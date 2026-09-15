# KPFK artwork audit — September 15, 2026

Source: https://archive.kpfk.org/fe_feed/fe_catalog_kpfk.json

The screenshot’s missing artwork originates in empty catalog `photoUrl` values. The app shows the dark placeholder `/assets/kpfk-artwork-placeholder.svg` behind them (the earlier orange-K `kpfk-placeholder.svg` is no longer used).

| Coverage | With image URL | Empty image URL | Total |
| --- | ---: | ---: | ---: |
| Catalog directory | 103 | 81 | 184 |
| Shows with current recordings | 81 | 28 | 109 |

All 103 supplied image URLs were fetched directly and through the running KPFK `/api/artwork/` proxy on port 8081. Every request returned HTTP 200 and an image content type. No URL or proxy failures occurred in this check. This verifies delivery, not visual quality or every possible future network condition.

Empty examples: Contacto Ancestral, Counterspin, Hablando de Sudamerica, Perspectiva de Las Americas, Radio Maiz, Something’s Happening A hours 1–3, and Informativo Pacifica Online (upload source 2kpfk).

Working examples: Informativo Pacifica, Revolucion Arcoiris, This Way Out. The Online upload and the regular Informativo Pacifica are separate catalog identities; the app does not silently borrow one image for the other.

No runtime change is needed to restore supplied URLs: they are being served successfully. Filling missing artwork requires Pacifica to populate those shows’ photoUrl fields, or a separately agreed local artwork mapping. The wide temporary station logo also crops poorly in square cards; that is a separate presentation issue.

Per-URL responses: [artwork-probes-2026-09-15.json](artwork-probes-2026-09-15.json). Three concurrent checks, bounded request timeouts; no episode membership changes or feed writes.

## Full JSON recheck following user review

Fetched all eight current feeds: catalog, channels, now-playing, schedule index, schedule stamp, and every one of the three indexed schedule weeks. Recursively inspected all object keys and scalar values, including all 1,140 episode records, publication entries and HTML decoded up to three times. No alternate image/thumbnail/cover fields or embedded image references were found outside `photoUrl`.

The catalog still has 103 populated photoUrl fields and 81 empty fields. All 444 published schedule slots contain `https://confessor.kpfk.org/pix`, with no image filename. The current now-playing photoUrl has that same value. Fetching it follows a redirect to `/pix/` and returns HTTP 403 with HTML, not an image. Channels, index and stamp contain no artwork fields.

The conclusion is limited to the supplied current JSON: it does not establish whether Pacifica has additional artwork in its database or on show websites. Ask the engineer whether empty catalog photoUrl values reflect missing source artwork or an export issue, and whether the filename omission in schedule/live photoUrl is intentional.
