# Dashboard drill-downs

Dashboard drill-downs let a user inspect usage for a specific time scope (a single `YYYY-MM-DD` day, Today, Last 7 days, Last 30 days, or Lifetime), browse per-platform watched video histories for YouTube, Twitch, and Kick with `?range=`/`?date=` scope filtering, inspect Google subdomain vs registrable-domain breakdowns, view per-day totals for any site domain, and handle invalid routes cleanly.

## Sub-features

- `drilldown-scope` opens `#/<today|week|month|lifetime|YYYY-MM-DD>` showing `PlatformCards` and `AllSitesTable` for that scope.
- `drilldown-range-propagation` preserves the active scope (`?range=today|week|month|lifetime` or `?date=YYYY-MM-DD`) when clicking a `PlatformCard` into `#/platform/<platformId>`.
- `drilldown-platform` opens `#/platform/<youtube|twitch|kick>` showing `VideosTable` merged with `videoMetaData`, video count badge, external video/channel links, and scope date links.
- `drilldown-google-subdomains` separates Google product subdomains (`drive.google.com`, `mail.google.com`) in `AllSitesTable` while merging subdomains of other domains (`www.youtube.com` + `m.youtube.com` under `youtube.com`).
- `drilldown-site` opens `#/site/<domain>` showing `DailyUsageTable` sorted by descending byte usage with percentage share and date links.
- `drilldown-not-found` renders `Page not found` (`DashboardNotFound`) cleanly for unknown routes or unsupported platform IDs without crashing.

## How to get to it (user POV)

- Click `View Details →` on any `StatsRow` card (`today`, `week`, `month`, `lifetime`) or click a day bar in the daily chart.
- Click a platform card (`Youtube`, `Twitch`, `Kick`) inside a scope page to open `#/platform/<platformId>?range=...` (or `?date=...`).
- Click a bar in the `By Site` chart or click `<Site> Usage` in the popup to open `#/site/<siteName>`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify Today scope, Google subdomain separation, and domain merging.** Run `bun run verify start --target today --seed full`, `bun run verify snapshot .verify-evidence/drilldowns/today.aria.txt`, and `bun run verify screenshot .verify-evidence/drilldowns/today.png`. Observable result: `AllSitesTable` shows `youtube.com` (`www` + `m` merged), `twitch.tv`, `kick.com`, `github.com`, `drive.google.com`, and `mail.google.com` as distinct rows alongside `PlatformCards` (`Errors: 0`).
- **Verify range scopes (`week`, `month`, `lifetime`) and `?range=` propagation.** Run `bun run verify goto week`, `bun run verify snapshot` (confirm 7-day range header), click `bun run verify click --role link --name "Youtube"`, then inspect `bun run verify goto month` and `bun run verify goto lifetime`. Observable result: clicking `Youtube` navigates to `#/platform/youtube?range=week`, displaying watched videos across the 7-day window with `Errors: 0`.
- **Verify platform video tables (YouTube, Twitch, Kick).** Run `bun run verify goto platform:youtube`, `bun run verify snapshot .verify-evidence/drilldowns/youtube.aria.txt`, `bun run verify screenshot .verify-evidence/drilldowns/youtube.png`, then `bun run verify goto platform:twitch`, `bun run verify snapshot`, `bun run verify goto platform:kick`, and `bun run verify snapshot`. Observable result: seeded titles (`Learn Python`, `React in 100 Seconds`, `Ranked grind to Radiant`, `GTA RP`) appear with video/channel/date links and `Errors: 0`.
- **Verify site detail view.** Run `bun run verify goto site:youtube.com`, `bun run verify state`, `bun run verify snapshot .verify-evidence/drilldowns/site-youtube.aria.txt`, and `bun run verify screenshot .verify-evidence/drilldowns/site-youtube.png`. Observable result: `DailyUsageTable` lists all 14 days for `youtube.com` with `%` share, `Total`, and clickable `YYYY-MM-DD` day links (`Errors: 0`).
- **Verify invalid route and unsupported platform 404 handling.** Run `bun run verify goto platform:unknown`, `bun run verify snapshot`, `bun run verify goto "#/unknown/deep/path"`, and `bun run verify state`. Observable result: `Page not found` and `Back to Dashboard` render cleanly with `Errors: 0` (no route error boundary crash).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `today` resolves to the local `en-CA` date key (`YYYY-MM-DD`) at runtime; seeding with `bun run verify seed full` always generates 14 days ending on today.
- `site:<domain>` expects the site key from `getSiteKey` (e.g. `youtube.com`, `github.com`, `drive.google.com`), not a full origin URL (`https://www.youtube.com`).
- Seeded metadata intentionally leaves `thumbnailUrl: ""` so platform placeholders render deterministically even offline.
- `VideosTable` sorts rows descending by bytes consumed and merges `watchHistory` with `videoMetaData`; videos whose metadata failed to fetch fall back to displaying the platform name as title.
