# Toolbar usage badge

The toolbar usage badge displays today's cumulative all-sites internet consumption directly on the TubeSize extension icon using compact decimal SI units (for example `570K`, `12M`, `1.2G`) and clears itself completely when today's total is `0 B`.

## Sub-features

- `badge-empty-cleared` clears the extension action badge text to `""` when today's `siteUsage` total is `0` bytes.
- `badge-live-update` updates the action badge text and purple-blue background (`rgb(102, 126, 234)`) automatically after usage is flushed to IndexedDB.
- `badge-si-formatting` formats compact SI labels (`<1 KB` as `B`, `<1 MB` as `K`, `<1 GB` as `M`, `>=1 GB` as `G`) using decimal base-1000 thresholds.

## How to get to it (user POV)

- Look at the TubeSize extension icon in the browser toolbar while browsing any website.
- Hover or click the icon after clearing usage data vs after generating network traffic.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify empty badge starts cleared.** Run `bun run verify start --target fixture:usage-site --seed empty` and `bun run verify state`. Observable result: `Badge:   "" rgba(0,0,0,0)` (empty string prior to first flush) and `DB: 0 days` with `Errors: 0`.
- **Verify badge updates after live site traffic.** Run `bun run verify click --role button --name "Run all usage paths"`, `bun run verify wait --text "Done: 570000 bytes expected"`, `bun run verify wait --ms 6500`, `bun run verify state --json`, and `bun run verify state`. Observable result: `Badge:   "570K" rgba(102,126,234,255)` reflecting `570000` bytes recorded for today, with `Errors: 0`.
- **Verify compact SI badge formatting math.** Run `bun run test`. Observable result: `src/tests/format.test.ts` passes all `formatBadge` boundary assertions (`999B`, `1K`, `2M`, `1.2G`).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `refreshUsageBadge()` reads **today's** `siteUsage` row only, so seeding historical days without today or starting `--seed empty` leaves the badge at `""` until live traffic arrives today.
- Because classic `blob:` worker flushes (3s), page flushes (3s), and background buffer flushes run on 3-second intervals, wait `6500 ms` after generating traffic before reading `Badge:` via `bun run verify state`.
- `chrome.action.getBadgeText({})` cannot be rendered inside a page screenshot; inspect the authoritative Chromium badge value and RGBA color via `bun run verify state` / `state --json`.
