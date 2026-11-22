# Dashboard overview

The Dashboard overview displays a user's total data usage across Today, Last 7 Days, Last 30 Days, and Lifetime summary cards alongside interactive By Day and By Site usage charts, with a clean empty state when no usage has been recorded yet.

## Sub-features

- `overview-stats-row` renders Today, Last 7 Days, Last 30 Days, and Lifetime byte totals with `View Details` links.
- `overview-daily-chart` displays per-day bar chart data at `#/daily` (and redirects `#/` to `#/daily`).
- `overview-sites-chart` switches to per-site usage breakdown at `#/sites` via `link "By Site"`.
- `overview-empty-state` renders `NoUsageData` cleanly without errors when IndexedDB has zero rows.
- `overview-rtl` renders Arabic copy and `dir="rtl"` layout cleanly without broken charts or overflow.

## How to get to it (user POV)

- Click `Dashboard` in the TubeSize popup header.
- Open `chrome-extension://<extId>/dashboard.html` (automatically redirects `#/` to `#/daily`).
- Switch between `By Day` and `By Site` in the chart header.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Open seeded Daily overview.** Run `bun run verify start --target daily --seed full`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/overview/daily.png`. Observable result: `DB: 14 days, 6 videos`, `dir=ltr`, `Errors: 0`, and `daily.png` shows 14 daily bars + `StatsRow`.
- **Switch to By Site chart.** Run `bun run verify click --role link --name "By Site"` and `bun run verify screenshot .verify-evidence/overview/sites.png`. Observable result: navigates to `dashboard.html#/sites` with `newErrors=0` and renders site bars.
- **Verify empty state.** Run `bun run verify seed empty`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/overview/empty.png`. Observable result: `DB: 0 days`, `Errors: 0`, and `NoUsageData` renders without triggering `DashboardErrorPage`.
- **Verify Arabic RTL layout.** Run `bun run verify seed full --lang ar`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/overview/daily-ar.png`. Observable result: `dir=rtl`, `Errors: 0`, and Arabic headings render cleanly.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Dexie maps schema `version(1)` to IndexedDB version `10` (`N * 10`). Always use `bun run verify seed` rather than opening `indexedDB.open("TubeSize", 1)` manually.
- `dashboard.html` lives on `chrome-extension://<extId>`; IndexedDB data seeded on a normal web tab is invisible to the dashboard.
- Visually inspect `daily.png` and `sites.png` to confirm chart bars rendered (not just empty axes).
