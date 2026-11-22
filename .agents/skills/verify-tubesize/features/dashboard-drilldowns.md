# Dashboard drill-downs

Dashboard drill-downs let a user inspect usage for a specific time scope (a single day, Today, Last 7 Days, Last 30 Days, or Lifetime), browse per-platform watched video histories for YouTube, Twitch, and Kick, and view per-day totals for any single site domain.

## Sub-features

- `drilldown-scope` opens `#/<today|week|month|lifetime|YYYY-MM-DD>` showing `PlatformCards` and `AllSitesTable` for that scope.
- `drilldown-platform` opens `#/platform/<youtube|twitch|kick>` showing `VideosTable` merged with `videoMetaData`.
- `drilldown-site` opens `#/site/<domain>` showing `DailyUsageTable` with registrable-domain aggregation (`www.youtube.com` + `m.youtube.com` merged under `youtube.com`).
- `drilldown-not-found` renders `DashboardNotFound` cleanly for unknown routes or unsupported platform IDs without crashing.

## How to get to it (user POV)

- Click `View Details` on any `StatsRow` card (`today`, `week`, `month`, `lifetime`) or click a day bar in the daily chart.
- Click a platform card (`YouTube`, `Twitch`, `Kick`) inside a scope page to open `#/platform/<platformId>`.
- Click a site row in `AllSitesTable` or a bar in the `By Site` chart to open `#/site/<siteName>`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Start seeded session and verify Today scope.** Run `bun run verify start --target today --seed full`, `bun run verify snapshot`, and `bun run verify screenshot .verify-evidence/drilldowns/today.png`. Observable result: renders platform cards and site rows with `Errors: 0`.
- **Verify platform video tables.** Run `bun run verify goto platform:youtube`, `bun run verify snapshot`, `bun run verify screenshot .verify-evidence/drilldowns/youtube.png`, then `bun run verify goto platform:twitch`, `bun run verify snapshot`, `bun run verify goto platform:kick`, and `bun run verify snapshot`. Observable result: seeded video titles (`Learn Python`, `React in 100 Seconds`, `Ranked grind to Radiant`, `GTA RP`) appear in each platform's `snapshot` with `Errors: 0`.
- **Verify site detail view.** Run `bun run verify goto site:youtube.com`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/drilldowns/site-youtube.png`. Observable result: daily breakdown table for `youtube.com` renders with `Errors: 0`.
- **Verify invalid route 404 handling.** Run `bun run verify goto platform:unknown` and `bun run verify state`. Observable result: `DashboardNotFound` renders cleanly with `Errors: 0` (no route error boundary crash).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `today` resolves to the local `en-CA` date key (`YYYY-MM-DD`) at runtime; seeding with `bun run verify seed full` always generates 14 days ending on today.
- `site:<domain>` expects the registrable domain from `getSiteKey` (e.g. `youtube.com`, `github.com`), not a full origin URL (`https://www.youtube.com`).
- Seeded metadata intentionally leaves `thumbnailUrl: ""` so platform placeholders render deterministically even offline.
