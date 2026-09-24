# Ace's homepage review — what is actually going on (2026-09-24)

Ace annotated a screenshot of podcast.kpfk.org ("an episode feed labeled as a show
directory") with four points. This records what was checked against the live site
and the Pacifica sources the same day. **Findings and options only — nothing is
scoped or decided.**

## Status of the four points after the 2026-09-24 deploy (`d3ca868`)

| # | Ace's point | Live now | Status |
| --- | --- | --- | --- |
| 1 | "1002 shows found" counts episodes; better, one card per show with a latest badge | Reads **"1035 episodes found"**; grid is still one card per episode | Label fixed; show-first layout **open** |
| 2 | Placeholder suggests "jazz"/"housing", both return nothing | Placeholder is **"Search shows, hosts or episode topics…"**; "jazz" finds 4 shows by description | **Fixed** (his screenshot predates the deploy) |
| 3 | One broadcast (Something's Happening A/B, Hours 1–3) takes six grid slots; generic art and Hour/hour casing are metadata issues | Still six cards | **Open** — see below; the source data defines six programs |
| 4 | "Latest show" should read "Latest episode"; keep a small "Just aired" rail | Reads **"Latest episode Sep 24, 8:00 AM"** | Label fixed; rail is part of point 1 |

## Where the six cards come from

Every Pacifica source treats each overnight hour as its own program:

| Source | What it shows |
| --- | --- |
| Confessor JSON (`fe_catalog_kpfk.json`, what the app reads) | Six directory entries with separate ids — `somethingshappening`, `somethihappenihour`, `somethihappenihoura`, `somethingshappeningb`, `somethihappenibhour`, `somethihappenibhoura` — each with ~33 daily recordings of 60 min |
| kpfk.org schedule | Six separate schedule entries and pages, "Something's Happening A Hour 1" … "B Hour 3" |
| archive.kpfk.org (Pacifica's archive page) | Six entries in its "All Shows" menu, same Hour/hour casing; the page itself is an episode list (1,169 MP3s, 118 shows in the menu) |
| archive2.wbai.org (Otis's XML version) | Same software and model (967 episodes, 143 shows); **no hour-split programs** — the split is a KPFK scheduling practice |

It is a **nightly overnight block, 12–6 am**, not one Sunday show. And each hour
carries a **different program depending on the day**, per Pacifica's own
descriptions: A hour 1 is Tue *Creative Frontline*, Wed *About Health*, Thu *David
Emory's For the Record*; A hour 2 Tue *Behind the News*, Wed *Herbal Highway*; B
hours 2–3 re-air *Thom Hartmann*. Collapsing the six into one card would hide the
real programs inside.

The podcast app faithfully mirrors Pacifica's model: an episode list with a show
filter, like archive.kpfk.org. Ace's critique applies to that model, and several
items (names, casing, generic art, the hour split) can only be fixed in the source
data that KPFK staff enter.

## Options (not decided)

1. **Show-first homepage** (point 1): one card per program with "Latest: date",
   plus a small "Just aired" rail. The discovery app already does this
   ("Explore shows" + "Just aired").
2. **Group the overnight block** (point 3): the data has no parent link between the
   six hours, so grouping needs either a station-maintained grouping in the station
   profile, or a name pattern ("… hour N") — fragile given the casing. Any grouping
   should still show which program is in each hour.
3. **Fix at the source** (point 3): consistent names/casing and real artwork in
   Confessor, entered by KPFK. Ace, as GM, can direct this.
4. **Name the real programs:** the day-specific program names exist only in
   descriptions and the kpfk.org schedule; QIR summaries already describe each
   hour's actual content, so the discovery app shows the real topic per episode.
