# Dashboard overview

The Dashboard overview displays a user's total data usage across Today, Last 7 days, Last 30 days, and Lifetime summary cards alongside interactive `By Day` and `By Site` usage charts with hover tooltips and drill-down bar clicks, plus a clean empty state when no usage has been recorded yet.

## Sub-features

- `overview-stats-row` renders Today, Last 7 days, Last 30 days, and Lifetime byte totals with `View Details →` links.
- `overview-daily-chart` displays per-day bar chart data at `#/daily` (and redirects `#/` to `#/daily`) alongside a pluralized day-count pill.
- `overview-sites-chart` switches to per-site horizontal bar chart at `#/sites` via `link "By Site"`, omitting sites under `1 MB` and showing up to the top `10` sites.
- `overview-chart-tooltips` renders site breakdown tooltips on hover over `By Day` bars and per-site totals on hover over `By Site` bars.
- `overview-bar-navigation` navigates to `#/<YYYY-MM-DD>` when clicking a day bar in `By Day`, and to `#/site/<siteName>` when clicking a site bar in `By Site`.
- `overview-empty-state` renders `No usage data available.` cleanly without errors when IndexedDB has zero rows.
- `overview-rtl` renders Arabic copy and `dir="rtl"` layout cleanly without broken charts or overflow.

## How to get to it (user POV)

- Click `Dashboard` in the TubeSize popup header.
- Open `chrome-extension://<extId>/dashboard.html` (automatically redirects `#/` to `#/daily`).
- Switch between `By Day` and `By Site` in the chart header, hover bars for tooltips, or click a bar to drill down.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Open seeded Daily overview and verify chart tooltip + bar drill-down.** Run `bun run verify start --target daily --seed full`, `bun run verify state`, `bun run verify snapshot .verify-evidence/overview/daily.aria.txt`, `bun run verify hover --selector '.recharts-bar-rectangle path' --nth 0`, `bun run verify screenshot .verify-evidence/overview/daily.png`, then `bun run verify click --selector '.recharts-bar-rectangle path' --nth 0`. Observable result: `DB: 14 days, 6 videos`, `dir=ltr`, `daily.png` shows 14 daily bars + `StatsRow` + tooltip (`All`, top 3 sites, `+<N> more`), and clicking the bar navigates to `dashboard.html#/YYYY-MM-DD` (`Errors: 0`).
- **Switch to By Site chart and verify tooltip + site drill-down.** Run `bun run verify goto sites`, `bun run verify screenshot .verify-evidence/overview/sites.png`, `bun run verify hover --selector '.recharts-bar-rectangle path' --nth 0`, and `bun run verify click --selector '.recharts-bar-rectangle path' --nth 0`. Observable result: `dashboard.html#/sites` renders horizontal site bars sorted descending (`youtube.com` first) and clicking the top bar opens `dashboard.html#/site/youtube.com` (`Errors: 0`).
- **Verify empty state.** Run `bun run verify goto daily`, `bun run verify seed empty`, `bun run verify state`, `bun run verify snapshot .verify-evidence/overview/empty.aria.txt`, and `bun run verify screenshot .verify-evidence/overview/empty.png`. Observable result: `DB: 0 days`, `Errors: 0`, and `No usage data available.` renders without triggering `DashboardErrorPage`.
- **Verify Arabic RTL layout and pluralization.** Run `bun run verify seed full --lang ar`, `bun run verify state`, `bun run verify snapshot .verify-evidence/overview/daily-ar.aria.txt`, and `bun run verify screenshot .verify-evidence/overview/daily-ar.png`. Observable result: `dir=rtl`, `Errors: 0`, and Arabic headings (`اليوم`, `آخر 7 أيام`, `14 يومًا`) render cleanly while Recharts bars stay `dir="ltr"` without overlapping labels.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Dexie maps schema `version(1)` to IndexedDB version `10` (`N * 10`). Always use `bun run verify seed` rather than opening `indexedDB.open("TubeSize", 1)` manually.
- `dashboard.html` lives on `chrome-extension://<extId>`; IndexedDB data seeded on a normal web tab is invisible to the dashboard.
- `ChartSites` drops any site below `1,000,000` bytes (`1 MB`) and caps display at `10` sites; small traffic recorded on `fixture:usage-site` (`570 KB`) appears in `By Day`, `StatsRow`, and `AllSitesTable`, not in `By Site` until `>= 1 MB`.
- Visually inspect `daily.png` and `sites.png` to confirm chart bars rendered (not just empty axes).
