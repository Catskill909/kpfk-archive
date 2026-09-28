# Integration plan — one app, with Discovery as a plugin inside it

**Goal:** one deployable app (the podcast site, `kpfk-archive`) for every Pacifica station, with
Discovery (QIR search, summaries, transcripts) as a switch-on plugin for stations that have it.
Started 2026-09-28. Owner: Paul. **Last updated: 2026-09-28.**

> This file is identical in two repos (like `APP-FAMILY.md`). Edit it in one and copy it to the
> other in the same session: `kpfk-archive/docs/INTEGRATION-PLAN.md` and
> `kpfk-discovery-plugin/docs/INTEGRATION-PLAN.md`.

---

## At a glance

| Step | What | Status | Live on podcasts.kpfk.org? |
|---|---|---|---|
| 1 | Move Discovery into the podcast site | ✅ Done | Yes — Discovery ON for KPFK |
| 2 | One design system; popups never cover the player | ✅ Done | Yes |
| 3 | The player (spare copy removed, keyboard reaches it) | ✅ Done | Yes |
| 4 | Discovery's sections on the main page | 🟡 5 of 6 parts done | Mostly — see below |
| 5 | Discovery admin as a studio tab | 🟡 5a done, 5b to do | 5a yes |
| 6 | Stats for both sides in the studio | ✅ Done | Yes — Studio → Listening → Feature clicks |
| 7 | Import / export cover everything | ⬜ Not started | — |
| 8 | Production release (retire the separate Discovery site) | ⬜ Not started | — |

**Legend:** ✅ done · 🟡 in progress · ⬜ not started

## Live now on podcasts.kpfk.org (checked 2026-09-28, late)

Everything built on 2026-09-28 is live **except the LIVE badge** (pushed last, next redeploy).
Storage intact (`/healthz` `instanceId` 73039ae5-…). Discovery is ON for KPFK, QIR key set.

- **Player:** always visible and usable under every popup; no Close; floating card on wider
  screens (no outline, bottom fade); Transcript/Songs button soft when closed, solid orange when
  open; no "Playing/Paused" word. Keyboard reaches it from every popup.
- **Discovery on the main page:** QIR headlines and summaries in search, the Episodes tab and the
  show popup; Transcript / Songs panel (read along, find, tap a line to play).
- **Just aired** updates itself every 2 minutes (new episodes slide in); **All / Shows / Episodes**
  tabs; Discovery-style show cards on desktop.
- **Show popup:** Episode info | Show info tabs; says why an episode has no notes yet
  ("Transcript processing…").
- **Permanent links** to shows and episodes, with social previews ([how to link](LINKS.md)).
- **Studio:** Discovery tab (live switches), Feature clicks stats, Feed anomalies, in-app dialogs.

## Waiting for the next redeploy

- **LIVE badge** on the live-stream player (tablet/desktop): moving sound bars while playing.

## The old Discovery site (kpfk-discovery.pacifica.audio)

Still running, but every visitor sees a "Discovery has moved" notice with one button to
podcasts.kpfk.org and no way to dismiss it. It still calls QIR in the background until it is
retired (step 8). Nothing else is developed there.

## Start here tomorrow (written 2026-09-28, end of day)

Before the separate Discovery site can be closed, three things (about an hour, with tests):

1. **Music 14-day limit on the podcast site** (music licence; Discovery applied it, the podcast
   site never has — 1 music episode over 14 days was listed on 2026-09-28: Reggae Central, Sep 13).
   Station rule, so for every station: `musicWindowDays` / `musicShows` in the profile.
2. **Episode corrections on the podcast site** — the three Alan Watts fund-drive hours (Jul 26,
   Aug 2, Sep 27) still show as "On Contact" there; Discovery shows them right. Station rule:
   `episodeCorrections` in the profile.
3. **4f** `/discover` goes to the main page.

Then close the Discovery site: redirect `kpfk-discovery.pacifica.audio` to `podcasts.kpfk.org`
(old links keep working), stop its Coolify deployment. Ace already knows (email sent 2026-09-28).

**Open decision (Paul):** after the redeploy, is the floating player + bottom fade right, or
switch to a docked full-width bar with the controls in a slimmer centred row? (Both ready to do.)

## Next up

1. **4f** `/discover` points to the main page (one page for everyone).
2. **5b** Station template in the studio: edit a station's feeds, logo, colours and text, preview,
   apply, with a way back.
3. **6** Stats: transcript and summary clicks, Discovery searches (counts only).
4. **7** Import / export include Discovery's settings; prove a full restore.
5. **8** Production release.

## Paul — to do and decisions

- [ ] Add `QIR_API_KEY` to the podcast site app in Coolify (copy it from the Discovery app), then redeploy. *(in progress)*
- [ ] Try it: Studio → **Discovery** tab → switch Discovery on → look at the site → switch off.
- [ ] Decide when to switch Discovery on for listeners.
- [ ] Pick the remaining sections (table in Step 4): search results (4.6), show popup (4.7), episode + transcript (4.8).
- [ ] Say what the station template (5b) must let staff change first (logo? colours? feeds? text?).

## How to check it yourself

| Check | Where | What you should see |
|---|---|---|
| Player never covered | Play an episode, open any popup (show, schedule, menu, live, donate) | The player bar stays at the bottom and works |
| Show link | `podcasts.kpfk.org/show/lawsnddisor` | Law and Disorder opens on its latest episode |
| Old episode link | `podcasts.kpfk.org/show/lawsnddisor/999999999` | The show opens with a "rotated out" note |
| Tabs | Home page → Episodes | "All episodes", newest first, address ends `?tab=episodes` |
| Discovery switch | `podcasts.kpfk.org/studio` → Discovery tab | Two switches; on = Discover page and menu link appear, off = gone |
| Health | `podcasts.kpfk.org/healthz` | `storage.instanceId` unchanged across deploys (stats safe) |

## Links

- [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md) — design rules, popup audit results, how each fix is built
- [LINKS.md](LINKS.md) — linking to shows and episodes (for websites and social posts)
- [APP-FAMILY.md](APP-FAMILY.md) — how the podcast site, Discovery and the Flutter app fit together
- `tools/popup-audit/` — the repeatable browser check (player visible, Play tappable, keyboard)

---

## Rules for every step

1. **The bottom player is always visible and usable.** Popups open above it, never over it. Every
   popup has a clear way back and survives play, pause and episode changes.
2. **Popups use their width.** No single column with the right side empty; buttons sized to their
   label; phone first, then desktop.
3. **One design system.** One set of colours, type, spacing and popup layouts for both sides.
4. **One section at a time.** Compare both apps' versions, Paul picks, build, check.
5. **Stats stay anonymous.** Counters only, no identifiers, no search words (`public/track.js`).

**Why Discovery stays a switch even inside one app:** it is a paid package (AI cost + Pacifica's
margin), not every station will have it, and a QIR outage must never affect the main site. The
station profile (`stations/<id>.json`, `plugins.discovery`) says whether a station *may* have it;
the studio switch says whether it is *on*. The Flutter app (`kpfk-podcast`) is unaffected as long
as `/api/archive` keeps its shape.

**Why this order:** merge first, so every styling change happens once; design rules and the player
next, because every section sits on them; admin, stats and backup after the screens settle.

---

## Step details

### Step 1 — Move Discovery in ✅

- Discovery's server code is a module in this repo, `plugins/discovery/` (QIR catalog, "Transcript
  pending", corrections, music window, Just aired refresh, song lists, Listen along).
- It reads the archive and artwork from this app directly; its own archive fetch, artwork proxy
  and image cache are gone. The old 24 Sept copy (`public/review.*`, `lib/qir/service.js`) is removed.
- One port, one Dockerfile (ships `plugins/`), one Coolify deploy. Discovery's settings live on this
  app's named volume (`discovery/settings.json`).
- Checked with real QIR data: the catalog matched live Discovery (3,059 episodes, same holds, same
  music window, all 120 show pictures identical).
- The separate Discovery site (kpfk-discovery.pacifica.audio) keeps running until Step 8.

### Step 2 — Design system and popup layout ✅

- One stylesheet (`public/styles.css`) for both sides; Discovery's old copy is removed.
- **Player frame:** the bar is visible and usable under all 11 popups at phone and desktop — 22 of
  22 checks, up from 4. An offline test fails if a future popup covers it.
- Show popup and Discovery popup: two columns on desktop, Play near the top on phones. The live
  player card sized to its content. Everything else reviewed and kept.
- Details and screenshots: [DESIGN-SYSTEM.md](DESIGN-SYSTEM.md).

### Step 3 — The player ✅

- The show popup's hidden spare copy of the player is removed (the real bar is always visible).
- The keyboard reaches the player bar from every popup (one shared Tab loop).
- The "Now Playing sheet" idea is folded into 4e: tapping the bar already opens the show popup for
  what is playing; Transcript and Songs get added there.

### Step 4 — Discovery's sections on the main page 🟡

**Approach (Paul, 2026-09-28):** Discovery becomes part of the main page, not a separate page. It
shares the main top bar, search, player and popups, and adds its data where the station has it on.

- ✅ **4a Discovery on the main page** — where Discovery is on, the main page loads
  `plugins/discovery/public/main.js`, which adds QIR headlines (as episode titles) and summaries
  (as notes), never overwriting the feed's own. Search "Gaza": 4 episodes without Discovery, 96 with.
- ✅ **Permanent links** — `/show/<code>` and `/show/<code>/<episode>`, with social previews; old
  `?show=` links still work ([LINKS.md](LINKS.md)).
- ✅ **4b Just aired** — for every station: the newest programmes that have aired, for the chosen
  category (rules in `public/just-aired.js`). Three roomy cards: headline, show name bold in the
  accent colour, then date · time · length. Without Discovery the show name is the title (station
  feeds rarely have episode titles, so a headline line would only repeat it).
- ✅ **4c All / Shows / Episodes tabs** — under the search box in place of the count; Episodes lists
  every episode newest first (`?tab=episodes`). Large "Just aired" (with "Latest episodes") and
  "Explore shows" / "All episodes" headings. Phones drop the "Latest episode" line.
- ✅ **4d Show cards** — desktop: clean image with category, name, host and "Latest · date" under it;
  phones keep the title on the artwork so more shows fit.
- ✅ **4e Transcript and Songs on the main site** — where Discovery is on: a Transcript / Songs
  button in the player bar and in the show popup; the Listen along panel (read along, find in the
  episode, tap a line to play from there) runs on the main player; the show popup shows the
  episode's headline and summary (for every station where the feed or QIR has them). The Episodes
  tab leads with the headline where there is one. Checked on phone and desktop: 625-line transcript,
  tapping a line jumps the audio there, the player bar stays visible.
- ⬜ **4f** `/discover` points to the main page.

| # | Section / popup | Main side | Discovery | Pick (Paul, date) |
|---|---|---|---|---|
| 4.1 | Top bar | ✓ | ✓ | **Main side's** (2026-09-28) |
| 4.2 | Search box, category dropdown, sort | ✓ | ✓ | **Main side's** (2026-09-28) |
| 4.3 | All / Shows / Episodes tabs | — | ✓ | **On both** (2026-09-28) — done |
| 4.4 | Just aired | — | ✓ | **On both, Discovery's layout** (2026-09-28) — done |
| 4.5 | Show cards | text on image | text under image | **Desktop: Discovery's; phone: main's** (2026-09-28) — done |
| 4.6 | Search results | ✓ | ✓ | *to pick* |
| 4.7 | Show popup / past episodes | ✓ | ✓ | *to pick* (main's is live, improved in step 2) |
| 4.8 | Episode + transcript (Listen along) | — | ✓ | Discovery's panel on the main player (2026-09-28) — done |
| 4.9 | Schedule | ✓ | — | Main's (only one) |
| 4.10 | Live player | ✓ | — | Main's (only one) |
| 4.11 | Menu, Donate, Privacy, About | ✓ | — | Main's (only one) |
| 4.12 | Navigation between the two sides | ✓ | ✓ | Resolved by 4f (one page) |

### Step 5 — Discovery admin as a studio tab 🟡

- ✅ **5a** `podcasts.kpfk.org/studio` → **Discovery** tab, behind the studio sign-in: **Discovery on
  this station** and **Transcripts & summaries (QIR)**, saved on the data volume and applied at once.
  QIR status in plain words; Station & appearance (read-only). Starts **off**: deploying changes
  nothing for listeners until the switch is flipped. Tested end to end (sign-in, anti-forgery
  token, bad values refused, on → pages appear, off → gone).
- ⬜ **5b** Station template: edit a station's feeds, logo, colours and text in the studio, preview,
  apply, with a way back.

### Step 6 — Stats for both sides in the studio ✅

Done 2026-09-28: `ui` beacon with a closed list of names (server `UI_COUNTERS`), shown as
"Feature clicks" tiles in the studio (Discovery tiles only while Discovery is on). Tests:
`test/pacifica/ui-counters.test.js` (every name the page sends is counted) and the http test.
Not added: desktop "Copy link" (no such button yet; shares count only where the browser has a share menu).


Existing counters stay. New counters, only where Discovery is on: transcript opened; transcript line
clicked (jump to that moment); summary opened; Discovery search used (count only, never the words);
Just aired card played; "Transcript pending" shown; song list opened. Shown in the studio stats with
a Discovery column. README updated in the same commit.

### Step 7 — Import and export cover everything ⬜

The studio already has export, full backup, and import with preview / apply / undo. Add Discovery's
settings to them, then prove a full restore onto a fresh install (empty volume → import backup →
same site, same stats).

### Step 8 — Production release ⬜

- Deploy the one app; check `/healthz` version and the storage `instanceId`.
- Point kpfk-discovery.pacifica.audio at the main site.
- Retire the separate Discovery deployment; archive the `kpfk-discovery-plugin` repo with a pointer
  here. Update `docs/APP-FAMILY.md`.

---

## Open questions

- **Flutter app:** when it shows Discovery features, it will read them from this app's API. Not part
  of this plan; note any API choices that affect it.
- **Station settings:** which belong in `stations/<id>.json` (fixed per station) and which in the
  studio (changed by staff) — decided as part of 5b.

## Change log

| Date | Change |
|---|---|
| 2026-09-28 | Plan started. Step 1 (Discovery moved in), Step 2 (design system, player frame, popup layouts), Step 3 (player). |
| 2026-09-28 | Step 4: QIR data on the main page, permanent links, Just aired, All / Shows / Episodes tabs, show card layout. |
| 2026-09-28 | Step 5a: studio Discovery tab with live on/off switches. Plan reorganised for project tracking. |
| 2026-09-28 | Studio: real tabs, in-app confirmations (never browser pop-ups). Step 4e: Transcript and Songs on the main site; headlines in the Episodes tab and the show popup. |
| 2026-09-28 | Show popup layout reworked; popups beside the transcript; cards wrap; Just aired updates itself (2-minute check, cards slide in). |
| 2026-09-28 | Popup tabs (Episode info / Show info); live-stream Transcript button fix; persistent player (no Close); floating player card; "Transcript processing". Checked what is left before closing the Discovery site (see "Start here tomorrow"). |
| 2026-09-28 (late) | Step 6 stats; player no outline + bottom fade; Transcript button on/off look; LIVE badge; Discovery site forces visitors to podcasts.kpfk.org; Ace follow-up sent; status sections rewritten to match what is live. |
