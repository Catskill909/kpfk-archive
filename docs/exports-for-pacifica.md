# Combining stations' exports — a guide for Pacifica

Every Pacifica station running this app can download the same files from its studio
(**Export** in the header). This page is for whoever puts several stations' files
side by side. It is the "cross-station shape" promised in [exports.md](exports.md).

## What each station can send you

| Dataset | Files | Dates | What it answers |
| --- | --- | --- | --- |
| **Listening** | `daily`, `shows`, `reach` CSV · one JSON | any span, **UTC days** | How much listening, of what, from where |
| **Archive** | `episodes`, `shows` CSV · one JSON | any span, **local air date** | What the station aired and still holds |
| **Coverage** | `shows` CSV · one JSON | none — a snapshot | Which programs lack artwork, descriptions or recent episodes |
| **Station profile** | JSON | none — a snapshot | Name, frequency, timezone, links, category map |
| **Printable report** | a page → Save as PDF | any span | All of the above, for people rather than spreadsheets |

Each download has a **Read me** explaining every column, and every JSON file carries
the same explanation in its `manifest`.

## Stacking CSVs from several stations

- **Column names are identical at every station.** They come from the app's code,
  not from a station's settings, so KPFK's `daily` CSV and WBAI's have the same header.
- **Every row starts with `station`** (`kpfk`, `wbai`, …). Stack the files — paste one
  under another, or `Get Data → Combine` in Excel — and nothing is lost.
- **Keep one header row** when pasting by hand; the rest are identical.
- Files are **UTF-8 with a BOM**, so accented titles (`Español`) open correctly in Excel.

## Numbers you can add up, and numbers you cannot

- **Sum freely:** `page_views`, `episode_plays`, `live_tune_ins`, `searches`, `shares`,
  `seconds_listened_*`, `plays`, `episodes`, `duration_seconds`, `total_seconds`.
  They are raw counts and seconds — never rounded — so totals across stations are exact.
  Divide seconds by 3,600 for hours *after* adding.
- **Do not add "listeners".** There is no such column, on purpose: the app collects no
  identifier, so it cannot tell two plays by one person from two people. Plays and
  time listened are the honest measures.
- **Do not add reach percentages.** Add the `page_views` in each bucket, then work out
  shares from the combined totals.

## Dates: two clocks, stated in every file

- **Listening is in UTC days** (`date_utc`). Counters are assigned to a UTC day when
  recorded and cannot be re-split afterwards. The same UTC day covers different local
  hours at an Eastern and a Pacific station — fine for months, worth knowing for a
  single day.
- **Archive is by local air date** (`air_date_local`, in the station's own timezone,
  named in the manifest), because "what aired on the 5th" means the station's 5th.
- The station's timezone is in every manifest (`station_timezone`) and in the profile.

## Versions

- Every file carries a **`schema_version`** (in the manifest, and the profile lists
  every dataset's version under `exports_available`).
- The version changes **only when a column's meaning changes**. A new column can be
  added without a new version, so read columns by name, not by position.
- When combining, check the versions match; if they do not, the Read me of each file
  says what its columns mean.

## Program data (coverage)

- `in_published_schedule` is **empty** when that station's schedule could not be read
  at export time — treat it as unknown, not as false.
- `has_artwork` means the program has **its own** image. Pacifica's feed gives
  programs without one a generic station picture (for KPFK, `…/pix/KPFK_med.jpg`); an
  image shared by four or more programs is counted as no artwork, and the JSON lists
  it under `generic_artwork`.
- Coverage is a snapshot: take it from every station on the same day.

## Privacy

Listening files are counters only. No file from this app contains an IP address,
cookie, session or device id, user agent, or the words anyone searched for — not
because they are removed on export, but because they are never collected. Archive,
coverage and profile files describe programs and settings, never listeners.
