# Linking to shows and episodes

For station web pages, newsletters and social posts. Added 2026-09-28.

## The two kinds of link

| Link | Opens | Example |
|---|---|---|
| **Show** | the show, on its latest episode | `https://podcasts.kpfk.org/show/lawsnddisor` |
| **Episode** | that episode | `https://podcasts.kpfk.org/show/lawsnddisor/138584` |

- **Show links never expire** while the show is on the air. Use them for "listen to our show"
  links on websites and in bios.
- **Episode links never go dead either.** Once an episode rotates out of the archive, the link
  opens the show on its latest episode, with a short note saying so.
- Pasted into Facebook, X, Messages or Slack, both show the show's artwork, name and
  description.

## How to get a link

1. Open the show or episode on podcasts.kpfk.org.
2. Copy the address bar (or use the Share button on a phone). That is the episode link.
3. For a show link, remove the number at the end: `/show/lawsnddisor/138584` → `/show/lawsnddisor`.

## What the part after /show/ is

The station's own show code from Confessor (`lawsnddisor`, `onconta`, `dn`). It stays the same
when a show is renamed, so links keep working. The show's name also works as a shortcut
(`/show/law-and-disorder`), but a name link stops working if the show is renamed, so prefer
the code for anything permanent.

## Older links

Links in the old style (`podcasts.kpfk.org/?show=kpfk.kpfk.138584`) still work and switch to
the new style when opened.

## For developers

Rules in `public/links.js` (shared by the server's link previews and the page). Tests:
`test/pacifica/links.test.js` (rules) and `test/pacifica/http.test.js` (previews).
