# TubeSize verification map

This directory is the maintained source for verifying the user-facing behavior of TubeSize. Read this index before driving the extension, then follow the matching feature file as the verification recipe.

## Baseline preconditions

- Build the Chrome MV3 bundle (`bun run build`) or pass `--build` to `bun run verify start`.
- Run `bun run verify doctor` and require exit code `0`, confirming Chromium availability, a fresh `.output/chrome-mv3/manifest.json`, and clean MV3 service worker + popup boot. A stale build exits `2` (inconclusive) — rebuild and rerun `doctor` until it reports `fresh`.
- Start an isolated session with `bun run verify start --seed full --lang en` (uses an ephemeral `/tmp/ts-verify-*` profile; never drives the user's personal Chrome profile).
- Always run `bun run verify stop` after verification and confirm proof artifacts remain intact under `.verify-evidence/`.

## Driving conventions

- Prefer accessible ARIA handles from `bun run verify snapshot` (`--role` + `--name`) over CSS selectors or coordinates.
- Trigger user interactions with real Playwright commands (`click`, `fill`, `press`, `goto`); never mutate internal storage/DB directly to simulate a user action.
- Treat every command in a feature file as literal; keep flags and quoted names unchanged.
- Verify both English (`dir=ltr`) and Arabic (`dir=rtl`) whenever changing layouts, spacing, tables, or translated copy.
- Do not delete proof artifacts in `.verify-evidence/` during cleanup; `bun run verify stop` removes only the session process and temp profile.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an ARIA snapshot (`snapshot`), a 2× PNG screenshot (`screenshot`), and `state` showing `Errors: 0`.
- Mutation proof includes `reload` followed by `state` + `snapshot` confirming both rendered UI and persisted `chrome.storage.sync` / IndexedDB values.
- Report any unreachable path (such as live YouTube/Twitch/Kick playback behind bot checks or offline networks) with the attempted command and unmet precondition.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with bun run verify` starts with `Preconditions:` and uses labeled bullets pairing each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Settings & persistence](./settings-persistence.md) covers popup-to-settings navigation, Advanced View & Usage Limit Alert toggles, language switching (`en`/`ar` RTL), and persistence across reload.
- [Dashboard overview](./dashboard-overview.md) covers StatsRow summaries, By Day vs By Site charts, empty vs seeded states, and RTL layout.
- [Dashboard drill-downs](./dashboard-drilldowns.md) covers date/range scope views, per-platform watched video tables (YouTube/Twitch/Kick), per-site daily tables, and invalid-route handling.
- [Popup & video size inspector](./popup-video-inspector.md) covers the toolbar popup, header actions, unsupported-tab state, and active video quality size breakdown.
- [Usage data lifecycle](./usage-data-lifecycle.md) covers empty-state rendering, deterministic seeding, clearing all usage data, and JSON export/import validation.
