# Toolbar usage badge

The toolbar usage badge displays today's cumulative all-sites internet consumption directly on the TubeSize extension icon using compact decimal SI units (for example `570K`, `12M`, `1.2G`) and clears itself completely when today's total is `0 B`.

## Sub-features

- `badge-empty-cleared` clears the extension action badge text to `""` when today's `siteUsage` total is `0` bytes.
- `badge-live-update` updates the action badge text and purple-blue background (`rgb(102, 126, 234)`) automatically after usage is flushed to IndexedDB.
- `badge-clear-import-refresh` refreshes the action badge immediately after Dashboard **Clear All Usage Data** (`"" rgba(102,126,234,255)`) and **Import JSON** (formatted today total).
- `badge-si-formatting` formats compact SI labels (`<1 KB` as `B`, `<1 MB` as `K`, `<1 GB` as `M`, `>=1 GB` as `G`) using decimal base-1000 thresholds.

## How to get to it (user POV)

- Look at the TubeSize extension icon in the browser toolbar while browsing any website.
- Inspect the icon after generating network traffic, clearing usage data, or importing a JSON backup.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify empty badge starts cleared.** Run `bun run verify start --target fixture:usage-site --seed empty` and `bun run verify state`. Observable result: `Badge:   "" rgba(0,0,0,0)` (empty string prior to first flush) and `DB:      0 days, 0 videos, 0 B` with `Errors:  0`.
- **Verify badge updates after live site traffic.** Run `bun run verify click --role button --name "Run all usage paths"`, `bun run verify wait --text "Done: 570000 bytes expected"`, `bun run verify wait --ms 6500`, `bun run verify state --json`, and `bun run verify state`. Observable result: `Badge:   "570K" rgba(102,126,234,255)` reflecting `570000` bytes recorded for today, with `Errors:  0`.
- **Verify badge refreshes on Clear and Import.** Export today's usage via `bun run verify goto daily` + `bun run verify download .verify-evidence/badge/export.json --role button --name "Export To JSON"`, clear via `bun run verify click --role button --name "Clear All Usage Data"` + `bun run verify click --role button --name "Continue"`, run `bun run verify state` (expect `Badge:   "" rgba(102,126,234,255)` and `DB:      0 days`), then re-import via `bun run verify upload .verify-evidence/badge/export.json --role button --name "Import JSON"` and run `bun run verify state`. Observable result: Clear resets text to `""` while preserving `rgba(102,126,234,255)`, and Import restores `"570K" rgba(102,126,234,255)` (`Errors:  0`).
- **Verify compact SI badge formatting math.** Run `bun run test`. Observable result: `src/tests/format.test.ts` passes all `formatBadge` boundary assertions (`999B`, `12K`, `2M`, `2.4G`).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `refreshUsageBadge()` reads **today's** `siteUsage` row only, and neither `background/index.ts` startup nor `bun run verify seed` (`empty`/`full`/`heavy`) calls it — the badge stays at `"" rgba(0,0,0,0)` until live traffic, Clear, or Import triggers `refreshUsageBadge()`.
- Classic `blob:` worker flushes (3s) feed the page-world observer (3s), which relays through `UsageBridge` into `UsageIngestion` (flushing and refreshing the badge immediately), while `Content-Length` `webRequest` traffic flushes via `UsageIngestion` (3s); always wait `6500 ms` after worker traffic completes before reading `Badge:` via `bun run verify state`.
- `chrome.action.getBadgeText({})` cannot be rendered inside a page screenshot; inspect the authoritative Chromium badge value and RGBA color via `bun run verify state` / `state --json`.
