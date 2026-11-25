# Dashboard drill-downs

Dashboard drill-downs let a user inspect usage for a specific time scope (a single `YYYY-MM-DD` day, Today, Last 7 days, Last 30 days, or Lifetime), browse per-platform watched video histories for YouTube, Twitch, and Kick with `?range=`/`?date=` scope filtering, inspect Google subdomain vs registrable-domain breakdowns, view per-day totals for any site domain, and handle invalid routes cleanly.

## Sub-features

- `drilldown-scope` opens `#/<today|week|month|lifetime|YYYY-MM-DD>` showing `PlatformCards` and `AllSitesTable` for that scope.
- `drilldown-range-propagation` preserves the active scope (`?range=today|week|month|lifetime` or `?date=YYYY-MM-DD`) when clicking a `PlatformCard` into `#/platform/<platformId>`.
- `drilldown-platform` opens `#/platform/<youtube|twitch|kick>` showing `VideosTable` merged with `videoMetaData`, video count badge, external video/channel links, and scope date links.
- `drilldown-google-subdomains` separates Google product subdomains (`drive.google.com`, `mail.google.com`) in `AllSitesTable` while merging subdomains of other domains (`www.youtube.com` + `m.youtube.com` under `youtube.com`).
- `drilldown-site` opens `#/site/<domain>` showing `DailyUsageTable` sorted by descending byte usage with percentage share and date links.
- `drilldown-not-found` renders `Page not found` (`DashboardNotFound`) cleanly for unknown routes, invalid `:date` params (such as `2026-02-30`), or unsupported platform IDs without crashing, while unknown sites and valid-but-empty dates render `DashboardHeader` (`0 B`) + `NoUsageData` and invalid platform query params fall back to `Lifetime`.

## How to get to it (user POV)

- Click `View Details →` on any `StatsRow` card (`today`, `week`, `month`, `lifetime`), click `Total Usage Today` in the popup (`#/today`), or click a day bar in the daily chart.
- Click a platform card (`YouTube`, `Twitch`, `Kick`) inside a scope page to open `#/platform/<platformId>?range=...` (or `?date=...`).
- Click a bar in the `By Site` chart or click `<Site> Usage` in the popup to open `#/site/<siteName>`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify Today scope (`#/today` range vs `today` date shortcut), Google subdomain separation, and domain merging.** Run `bun run verify start --target "#/today" --seed full`, `bun run verify snapshot .verify-evidence/drilldowns/today.aria.txt`, `bun run verify screenshot .verify-evidence/drilldowns/today.png`, click `YouTube` (`bun run verify click --role link --name "YouTube"` → `#/platform/youtube?range=today`), then run `bun run verify goto today` (which resolves to `#/<YYYY-MM-DD>`) and click `YouTube` (`#/platform/youtube?date=<YYYY-MM-DD>`). Observable result: `AllSitesTable` shows `youtube.com` (`www` + `m` merged), `twitch.tv`, `kick.com`, `github.com`, `drive.google.com`, and `mail.google.com` as distinct rows alongside `PlatformCards`, and `?range=today` vs `?date=YYYY-MM-DD` propagate accurately (`newErrors=0`).
- **Verify range scopes (`week`, `month`, `lifetime`) and `?range=` propagation.** Run `bun run verify goto week`, `bun run verify snapshot` (confirm 7-day range header), click `bun run verify click --role link --name "YouTube"`, then inspect `bun run verify goto month` and `bun run verify goto lifetime`. Observable result: clicking `YouTube` navigates to `#/platform/youtube?range=week`, displaying watched videos across the 7-day window with `newErrors=0`.
- **Verify platform video tables (YouTube, Twitch, Kick) and invalid query fallback.** Run `bun run verify goto platform:youtube`, `bun run verify snapshot .verify-evidence/drilldowns/youtube.aria.txt`, `bun run verify screenshot .verify-evidence/drilldowns/youtube.png`, then `bun run verify goto platform:twitch`, `bun run verify snapshot`, `bun run verify goto platform:kick`, `bun run verify snapshot`, and `bun run verify goto "#/platform/youtube?date=2026-02-30"` + `bun run verify snapshot`. Observable result: seeded titles (`Learn Python`, `React in 100 Seconds`, `Ranked grind to Radiant`, `GTA RP`) appear with video/channel/date links, and the invalid `?date=2026-02-30` falls back to `Lifetime` without crashing (`newErrors=0`).
- **Verify site detail view and unknown-site empty state.** Run `bun run verify goto site:youtube.com`, `bun run verify state`, `bun run verify snapshot .verify-evidence/drilldowns/site-youtube.aria.txt`, `bun run verify screenshot .verify-evidence/drilldowns/site-youtube.png`, then `bun run verify goto site:nonexistent.example` + `bun run verify snapshot`. Observable result: `DailyUsageTable` lists all 14 days for `youtube.com` with `%` share, `Total`, and clickable `YYYY-MM-DD` day links; `site:nonexistent.example` renders `DashboardHeader` (`0 B`) + `No usage data available.` (`Errors: 0`).
- **Verify route guards (invalid `:date` 404, valid-but-empty date, unsupported platform, unknown deep path).** Run `bun run verify goto date:2026-02-30` + `bun run verify snapshot` (expect `404 Page not found`), `bun run verify goto date:2020-01-01` + `bun run verify snapshot` (expect `Jan 1, 2020`, `0 B`, `No usage data available.`), `bun run verify goto platform:unknown` + `bun run verify snapshot`, `bun run verify goto "#/unknown/deep/path"`, and `bun run verify state`. Observable result: invalid `:date`, unknown platform, and unknown deep paths render `404 Page not found` + `Back to Dashboard` cleanly with `Errors: 0`.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `bun run verify goto today` resolves to `dashboard.html#/<YYYY-MM-DD>` (a single-date route propagating `?date=`), whereas `bun run verify goto "#/today"` opens the named `today` range route (propagating `?range=today` and auto-refreshing across local midnight via `useCurrentDateKey()`).
- `SiteDetailPage` normalizes `:siteName` with `getSiteKey()` for lookups and displays the raw param in `DashboardHeader`; `bun run verify goto site:<key>` URI-encodes `<key>` automatically (pass raw `youtube.com`, `drive.google.com`, or `http://127.0.0.1:<port>`), whereas raw hash targets (`goto "#/site/<encoded>"`) must pass a URI-encoded origin for IP/`localhost` origins.
- Seeded metadata intentionally leaves `thumbnailUrl: ""` so platform placeholders render deterministically even offline, and `seed full` includes a Kick VOD (`kick:kick-vod-98231`) without a Kick live stream.
- `PlatformUsageContent` merges `watchHistory` with `videoMetaData` per `(day, videoKey)` row (separate rows across multiple days, sorted descending by bytes consumed); videos whose metadata failed to fetch fall back to displaying the lowercase platform name as title.
