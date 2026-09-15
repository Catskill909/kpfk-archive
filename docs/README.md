# Docs index

This repo was copied from `wbai-archive`, so `docs/` mixes documents written for
**this** app with WBAI's history. Use this index before trusting a doc. When you
next change an area covered by an inherited doc, rewrite that doc for KPFK and
move it up to the first table.

Current state and working rules live at the repo root: [HANDOFF.md](../HANDOFF.md),
[CLAUDE.md](../CLAUDE.md), [README.md](../README.md).

## Current — written for the KPFK app

| Doc | What it covers |
| --- | --- |
| [DEPLOYMENT.md](DEPLOYMENT.md) | Coolify setup, the `/app/data` volume, `/healthz` checks, backups |
| [kpfk/architecture.md](kpfk/architecture.md) | JSON provider contracts and decision record |
| [kpfk/implementation.md](kpfk/implementation.md) | Phase plan and implementation checkpoints |
| [kpfk/verification.md](kpfk/verification.md) | Contract, service and browser test matrices; release checklist |
| [kpfk/artwork-evidence-2026-09-15/](kpfk/artwork-evidence-2026-09-15/README.md) | Per-show artwork: catalog vs Confessor vs RSS, with raw captures |
| [kpfk/artwork-audit-2026-09-15.md](kpfk/artwork-audit-2026-09-15.md) | First artwork audit (superseded by the evidence folder, kept for probes) |
| [kpfk/archive-page-audit.md](kpfk/archive-page-audit.md) | KPFK HTML archive page vs JSON comparison |
| [kpfk-json-migration-plan.md](kpfk-json-migration-plan.md) | The original feed audit that led to this app |
| [fixtures/](fixtures/) | Pinned 2026-09-14 feed captures used by the tests — add dated sets, never replace |

## Shared behaviour — written for WBAI, still describes this app's front end

The player, sheet, touch and accessibility work carried over unchanged. Station
names and examples in these are WBAI's; the mechanics are the same.

| Doc | Still applies to |
| --- | --- |
| [live-audio-pattern.md](live-audio-pattern.md) | **Read before touching live audio.** The per-play live element model |
| [big-audio-bug.md](big-audio-bug.md) | Why that model exists; the stale-cache lesson behind CLAUDE.md §1 |
| [modal-live-audio-player.md](modal-live-audio-player.md) | Live player design record |
| [show-modal-archive.md](show-modal-archive.md) · [episode-rail.md](episode-rail.md) | Show sheet and Past episodes |
| [touch-dev.md](touch-dev.md) | Touch, scroll locking, overlays (source of CLAUDE.md §3a) |
| [accessibility.md](accessibility.md) | Front-end accessibility research |
| [admin-page.md](admin-page.md) | The `/studio` view and usage counters. Its feed-harvest panels describe WBAI's XML sources |
| [schedule-dev.md](schedule-dev.md) | Schedule **UI** rules (tabs, overlay, chooser, history). Its *derived* schedule is WBAI's; KPFK renders published slots (`paintPublishedSchedule`) |

## WBAI-era history — does not describe how this app gets its data

| Doc | Why it's here |
| --- | --- |
| [ARCHITECTURE.md](ARCHITECTURE.md) · [DEVELOPMENT.md](DEVELOPMENT.md) | WBAI's scrape + XML server and local workflow. For KPFK see HANDOFF, CLAUDE.md and `docs/kpfk/` |
| [UPSTREAM.md](UPSTREAM.md) · [archive-source-audit.md](archive-source-audit.md) | WBAI's archive2/confessor2 endpoints |
| [xml-feed-migration.md](xml-feed-migration.md) · [2026-07-29-xml-migration-log.md](2026-07-29-xml-migration-log.md) | WBAI's move to per-show XML |
| [missing-show.md](missing-show.md) | Diagnosing a missing WBAI show from its XML feeds (`npm run audit:schedule` is WBAI-only too) |
| [pacifica-json-dev.md](pacifica-json-dev.md) | Pre-build analysis of the Pacifica JSON format, written from WBAI |
| [station-config.md](station-config.md) · [TAURI.md](TAURI.md) | Desktop (Tauri) station profiles and builds — still WBAI-configured; KPFK desktop is an open item |
| [ROADMAP.md](ROADMAP.md) · [google-tv.md](google-tv.md) · [casting-dev.md](casting-dev.md) | WBAI proposals and research (casting was removed) |
