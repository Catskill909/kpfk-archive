# KPFK JSON feeds — show artwork evidence

**Captured:** 2026-09-15 17:00 UTC (catalog `updated` 1789491601).
**Question:** many KPFK shows have no artwork in the Pacifica JSON feeds. Is the
exporter dropping it, or does the artwork not exist upstream?
**Method:** for all 184 shows in `fe_catalog_kpfk.json`, the exact raw
`photoUrl` was compared with what KPFK's other public outputs carry for the same
show: Confessor's public schedule page (`pub_sched.php`, the page WBAI's app
has always taken show images from), each show's podcast RSS (70 feeds), and the
per-show info record (`_pa_get_show_info.php`). Every alternative image found
was fetched to confirm it loads. Raw responses are in [`raw/`](raw/), and the
per-show table is in [`shows.csv`](shows.csv). Reproduce with
`node tools/artwork-evidence.js <out-dir>`.

## Findings

### 1. The catalog's empty values are genuinely empty, and they match Confessor

- 81 of 184 shows have `"photoUrl": ""`. The key is always present and never `null` or missing.
- 28 of the 109 shows **with recordings** are among them.
- The 103 populated URLs are all `https://confessor.kpfk.org/pix/<slug>_med_<n>.jpg`,
  and all load (see [`../artwork-audit-2026-09-15.md`](../artwork-audit-2026-09-15.md)).
- Confessor's schedule page shows images for exactly **81 shows / 110 of 148
  slots**. Those 81 image URLs are **identical** to the catalog's, with 0 differences.
  For every on-air show the catalog leaves empty, Confessor's own page also has
  no image. Its tooltip for Counterspin or Radio Maiz has text only.
- The per-show info record has no photo field at all (category, description,
  producer only), so no larger image is being skipped.

**Conclusion: for on-air shows the exporter is faithful. The artwork was never
entered in KPFK's Confessor.** For comparison, on the same kind of page:

| Confessor `pub_sched.php` | Slots with show image | Shows with show image |
| --- | ---: | ---: |
| WBAI (`confessor2.wbai.org`) | 131 / 135 (97%) | 104 / 108 (96%) |
| KPFK (`confessor.kpfk.org`) | 110 / 148 (74%) | 81 / 101 (80%) |

KPFK on-air shows with no image **anywhere** (20): American Indian Airwaves,
California Solartopia, CinemaScore, Contacto Ancestral, Counterspin, East Side
Radio, Hablando de Sudamerica, In The Cut Radio, Making Contact, Perspectiva de
Las Americas, Radio Maiz, Senderos de Oaxaca, Something's Happening A hours 1–3,
Something's Happening B hours 1–3, Special Music Programming, Special
Programming.

### 2. Export gap: uploads (`2kpfk`) don't carry their on-air show's photo

The catalog **already has** the artwork for these. It sits on the on-air
(`kpfk`) entry of the same show, under a different `altid`. The upload entry is
exported with `"photoUrl": ""`. (Found by matching names in
[`raw/fe_catalog_kpfk.json`](raw/fe_catalog_kpfk.json); spotted by Paul via Bike Talk.)

| Upload entry (`2kpfk`, `photoUrl: ""`) | Episodes | Same show's on-air entry (`kpfk`) — `photoUrl` in the catalog |
| --- | ---: | --- |
| `informap` Informativo Pacifica Online | 41 | `infopac` Informativo Pacifica — `…/pix/infopac_med_181.jpg` |
| `biketalk` Bike Talk Podcast | 13 | `biketalka` Bike Talk — `…/pix/biketalka_med_263.jpg` |
| `politicorpedagog` Politics Or Pedagogy? 3 min edition | 13 | `politicorpedagoga` Politics Or Pedagogy? — `…/pix/politicorpedagoga_med_272.jpg` |
| `scholacirclepodast` Scholars Circle - Podcast | 11 | `marmoudian` Scholars Circle — `…/pix/marmoudian_med_167.jpg` |
| `bibliocracya` Bibliocracy | 0 | `bibliocracy` — `…/pix/bibliocracy_med_153.jpg` |
| `goharrison` Cary Harrison Files - Podcast | 0 | `caryharrisfiles` — `…/pix/caryharrisfiles_med_374.jpg` |
| `digitavillagpodcas` Digital Village - Podcast | 0 | `digivil` — `…/pix/digitalvillage_med_133.jpg` |
| `feministmagazine` Feminist Magazine | 0 | `femmag` — `…/pix/femmag_med_186.jpg` |
| `flashpointsa` Flashpoints | 0 | `flashpoints` — `…/pix/flashpoints_med_307.jpg` |
| `poetcafewhypoet` Poet's Cafe | 0 | `poetleber` — `…/pix/poetscafewhypoetry_250.jpg` |

The four with episodes currently render with no artwork in any app reading the
JSON. Nothing in the JSON links an upload to its on-air show, so an app can
only guess by name. We don't guess.

Two uploads also have a podcast image in their RSS (`/pix/*_it_*.jpg`, loads):
Bike Talk Podcast and Scholars Circle - Podcast. Uploads with no image in any
source and no on-air twin: BradCast w/ Brad Friedman, SWANA Podcast, The Out
Agenda - Online.

### 3. Export bug: schedule and now-playing never carry an image filename

- All **444** slots across the three `fe_schedule_kpfk_*.json` weeks, and
  `fe_nowplaying_kpfk.json` `current.photoUrl`, are exactly
  `"https://confessor.kpfk.org/pix"`. That URL has no filename; it redirects to
  `/pix/` and returns **HTTP 403 HTML**.
- This includes the 110 slots whose shows **do** have artwork. Confessor's own
  schedule page renders those same slots with `…/pix/<slug>_med_<n>.jpg`.
- This looks like the directory prefix being written without the file name. The
  catalog gets it right for the same shows.

### 4. No global default image in the feeds

No JSON file (catalog, channels, now-playing, schedule index/weeks) contains a
station logo or default-artwork field. The only station image on Confessor's
schedule page is `https://confessor.kpfk.org/pix/KPFK.jpg` (100×100 JPEG, loads).
It is the page's **header logo** and no show entry uses it as a fallback.

## Asks for the feed developer

1. **Schedule + now-playing `photoUrl`:** include the file name
   (`/pix/<slug>_med_<n>.jpg`), matching the catalog. All 444 slots and
   now-playing are currently affected.
2. **Uploads (`2kpfk`):** export the on-air show's `photoUrl` on its upload
   entry (e.g. `biketalk` ← `biketalka_med_263.jpg`, `informap` ←
   `infopac_med_181.jpg`), or add a field linking the upload to its on-air
   `altid` so apps can use that entry's artwork. If neither exists, the podcast
   image (`/pix/*_it_*.jpg`) is a reasonable fallback.
3. **Default artwork:** add a station-level default image to `fe_channels.json`
   (or the `station` block). Apps then have an official fallback for the shows
   with no photo, instead of each app inventing its own.
4. **Not a feed bug, for KPFK staff:** the 20 on-air shows above need artwork
   uploaded in Confessor. Once it is there, the catalog already exports it
   correctly.

## What the app does meanwhile

The app reads only the JSON. It does not scrape Confessor or RSS to fill these
gaps. Shows with an empty `photoUrl` get the dark waveform placeholder. Schedule
slots borrow the catalog image for the same show key, which works around ask #1
without inventing data.
