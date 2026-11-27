# TubeSize verification map

This directory is the maintained source for verifying every user-facing behavior of TubeSize. Read this index before driving the extension, then follow the matching feature file as the verification recipe.

## Baseline preconditions

- Build the Chrome MV3 bundle (`bun run build`) or pass `--build` to `bun run verify start` / `bun run verify smoke`.
- Run `bun run verify doctor` and require exit code `0`, confirming Chromium availability, a fresh `.output/chrome-mv3/manifest.json`, and clean MV3 service worker + popup boot. A stale build exits `2` (inconclusive) — rebuild and rerun `doctor` until it reports `fresh`.
- Run `bun run verify smoke` for a fast single-session end-to-end check across usage tracking, realtime calls (`WebSocket`, `WebRTC`, module `blob:` `Worker`), YouTube toaster/quality menu/popup, Twitch & Kick live popups, Settings + Arabic RTL persistence, and Dashboard export/clear/import.
- Start an isolated session with `bun run verify start --seed full --lang en` (or `--seed empty` / `--target fixture:*` per recipe). Never drive a personal Chrome profile.
- Always run `bun run verify stop` after verification and confirm proof artifacts remain intact under `.verify-evidence/`.

## Driving conventions

- Prefer accessible ARIA handles from `bun run verify snapshot` (`--role` + `--name`) over CSS selectors or coordinates.
- Trigger user interactions with real Playwright commands (`click`, `hover`, `fill`, `press`, `goto`, `popup open|close`, `wait`, `upload`, `download`); never mutate internal storage/DB directly to simulate a user action.
- Use `fixture:*` targets to exercise TubeSize's real built MV3 content scripts, background parsers, badge, toaster, quality menu injector, and real toolbar popup offline without bot checks or external network flakiness.
- Use `bun run verify popup open` when the active tab is a `fixture:*` page so `chrome.action.openPopup()` opens the real toolbar popup bound to that active tab; use `bun run verify popup close` before switching tabs if needed (`goto` also closes the popup automatically).
- Treat every command in a feature file as literal; keep flags and quoted names unchanged.
- Verify both English (`dir=ltr`) and Arabic (`dir=rtl`) whenever changing layouts, spacing, tables, or translated copy.
- Do not delete proof artifacts in `.verify-evidence/` during cleanup; `bun run verify stop` removes only the session process and temp profile.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot (`snapshot`), a 2× PNG screenshot (`screenshot`), and `state` showing `Badge`, IndexedDB counts/bytes, `chrome.storage`, `dir`, and `Errors: 0`.
- Mutation proof includes `reload` (or re-navigation) followed by `state` + `snapshot` confirming both rendered UI and persisted `chrome.storage` / IndexedDB values.
- Distinguish `fixture:*` network-boundary proofs (proving TubeSize's real built code against recorded/deterministic payloads) from live-internet upstream site behavior. Report any unreachable live external path with the attempted command and unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with bun run verify` starts with `Preconditions:` and uses labeled bullets pairing each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [All-sites usage tracking & watch history](./usage-tracking.md) covers `webRequest` `Content-Length` accounting, page-world `fetch`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, and classic or module `blob:` `Worker` observers, deduplication & exclusions, watch-history attribution with lazy metadata, and site-key normalization.
- [Toolbar usage badge](./toolbar-badge.md) covers clearing the badge at `0 B`, live compact SI updates (`K`/`M`/`G`), and badge color consistency.
- [Usage warning toaster](./usage-warning-toaster.md) covers bitrate threshold alerts on YouTube/Twitch/Kick VODs and live streams, resolution-change re-evaluation, `OK` vs daily suppression, Settings opt-out, and RTL layout.
- [YouTube quality menu injection](./youtube-quality-menu.md) covers injected `.ytp-quality-menu` size badges for VOD and live streams, skipping `Auto`/Premium entries, dynamic panel opens, and SPA navigation cleanup.
- [Platform size estimation (YouTube, Twitch & Kick)](./platform-size-estimation.md) covers active-tab toolbar popup size estimates across YouTube VOD/Shorts/Live, Advanced View codecs/itags/audio toggling, Twitch/Kick live HLS segment sampling vs ad fallback, VODs, caching, and non-video pages.
- [Popup shell, usage cards & changelog](./popup-video-inspector.md) covers the toolbar popup header, Today and current-site usage drill-down cards, unsupported-page and no-video states, one-time release changelog banner, and footer links.
- [Settings & persistence](./settings-persistence.md) covers popup-to-settings navigation, Advanced View & Usage Limit Alert toggles, slider threshold control, language switching (`en`/`ar` RTL), footer links, and persistence across reload.
- [Dashboard overview](./dashboard-overview.md) covers `StatsRow` summaries, `By Day` vs `By Site` charts, bar navigation, chart tooltips, empty vs seeded states, and RTL layout.
- [Dashboard drill-downs](./dashboard-drilldowns.md) covers date/range scope views (`today`, `week`, `month`, `lifetime`, `YYYY-MM-DD`), per-platform watched video tables, Google subdomain vs registrable-domain aggregation, per-site daily tables, and 404 handling.
- [Usage data lifecycle](./usage-data-lifecycle.md) covers empty-state rendering, deterministic seeding, clearing all usage data (cancel and confirm), JSON export/empty-export error, and JSON import validation/replacement.
- [Extension lifecycle & Firefox parity](./extension-lifecycle.md) covers install/update media cache cleanup, legacy settings migrations, and Firefox MV3 manifest/build parity.
- [Performance & memory](./performance.md) covers uncached vs cached popup size-estimation latency, cold Dashboard data-load timing (`full` 14-day & `heavy` 90-day datasets), service worker / page V8 heap & Chromium RSS memory footprint, and MV3 bundle sizes.
