# All-sites usage tracking & watch history

All-sites usage tracking measures actual network bytes transferred on every visited website using dual-path accounting (fixed `Content-Length` responses plus streamed `fetch`, `XMLHttpRequest`, and classic `blob:` `Worker` bodies), records daily totals in IndexedDB `siteUsage`, attributes countable traffic on supported watch pages to `watchHistory` (with lazy single-flight `videoMetaData` across both accounting paths), and normalizes origins into site keys and labels.

## Sub-features

- `tracking-webrequest` counts responses carrying a positive `Content-Length` header per tab origin and flushes batched totals to `siteUsage`.
- `tracking-fetch-stream` counts chunked/streamed `fetch()` response bodies that lack `Content-Length` via the `MAIN`-world observer and `usageBridge`.
- `tracking-xhr-stream` counts incremental `XMLHttpRequest` progress for streamed responses without `Content-Length`.
- `tracking-worker-stream` re-hosts classic `blob:` `Worker`s to count `fetch()` responses without `Content-Length` inside dedicated workers.
- `tracking-dedup-exclusions` avoids double-counting `Content-Length` responses across both paths and ignores `HEAD` requests, cached responses, and extension-origin URLs.
- `tracking-watch-history` attributes countable tab traffic on YouTube, Twitch, and Kick watch pages to `watchHistory` (`<platform>:<mediaId>`) and lazily records single-flight `videoMetaData` across both `webRequest` and `usageBridge` traffic.
- `tracking-site-normalization` merges subdomains like `www.example.com` and `m.example.com` while keeping Google product subdomains (`drive.google.com`, `mail.google.com`) distinct.

## How to get to it (user POV)

- Browse any `http://` or `https://` website while TubeSize is installed, then inspect Today's total and per-site usage in the toolbar popup or Dashboard (`dashboard.html#/today`).
- Watch a video or live stream on YouTube, Twitch, or Kick, then open `dashboard.html#/platform/<youtube|twitch|kick>` to see per-video data consumption and metadata.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify dual-path all-sites byte accounting without double counting.** Run `bun run verify start --target fixture:usage-site --seed empty`, `bun run verify click --role button --name "Run all usage paths"`, `bun run verify wait --text "Done: 570000 bytes expected"`, `bun run verify wait --ms 6500`, and `bun run verify state`. Observable result: `Today:` shows exact `http://127.0.0.1:<port>=570000` (200,000 fixed `Content-Length` + 150,000 chunked `fetch` + 100,000 chunked XHR + 120,000 `blob:` Worker; the 200,000 `HEAD` request is excluded and nothing is double-counted) with `Errors: 0`.
- **Verify all-sites dashboard visibility after live capture.** Run `bun run verify goto today`, `bun run verify snapshot .verify-evidence/usage-tracking/today.aria.txt`, and `bun run verify screenshot .verify-evidence/usage-tracking/today.png`. Observable result: `AllSitesTable` displays `http://127.0.0.1:<port>` with `570 KB` (`100.0%`) and `newErrors=0`.
- **Verify watch-history attribution and lazy video metadata on YouTube.** Run `bun run verify goto fixture:youtube-vod`, `bun run verify click --role button --name "Trigger media traffic 150 KB"`, `bun run verify wait --text "Sent 150000 bytes"`, `bun run verify wait --ms 4500`, and `bun run verify state`. Observable result: `Today:` includes `https://www.youtube.com` (`>=150000` bytes), `Watch:` records `youtube:I82j7AzMU80`, and `DB:` reports `1 videos` in `videoMetaData` (`Errors: 0`).
- **Verify watched video row in Dashboard.** Run `bun run verify goto platform:youtube`, `bun run verify snapshot .verify-evidence/usage-tracking/youtube-history.aria.txt`, and `bun run verify screenshot .verify-evidence/usage-tracking/youtube-history.png`. Observable result: table renders `"How does Claude Code *actually* work?"` by `"Theo - t3․gg"` (`newErrors=0`).
- **Verify Google subdomain separation.** Run `bun run verify goto fixture:google-drive`, `bun run verify click --role button --name "Trigger Drive traffic 250 KB"`, `bun run verify wait --text "Drive 250000 done"`, `bun run verify wait --ms 4500`, `bun run verify popup open`, `bun run verify snapshot`, and `bun run verify state`. Observable result: toolbar popup displays `"Google Drive Usage 250.6 KB"` (250,000-byte fetch plus the ~620 B fixture HTML document) cleanly with `Errors: 0`.
- **Verify domain normalization and accounting unit rules.** Run `bun run test`. Observable result: `src/tests/domain.test.ts`, `src/tests/usageTracker.test.ts`, `src/tests/usageBridge.test.ts`, `src/tests/usageIngestion.test.ts`, and `src/tests/videoMetadata.test.ts` pass.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Re-hosted `blob:` workers (`setInterval(..., 3000)`) flush to the page-world observer (`setInterval(..., 3000)`), which relays through `UsageBridge` into `UsageIngestion` (flushing immediately), while `Content-Length` `webRequest` traffic flushes via `UsageIngestion` (`setInterval(..., 3000)`); always wait at least `6500 ms` (`wait --ms 6500`) after worker traffic completes before asserting `state`.
- On `fixture:usage-site`, the page document itself is served as a chunked stream without `Content-Length` so initial navigation HTML does not alter the expected `570000` byte count.
- `UsageIngestion` flushes buffered `webRequest` `siteUsage` and `watchHistory` inside `setInterval` in the background service worker; in long-lived sessions keep the session alive during the 3–4.5s flush window rather than calling `stop` immediately.
