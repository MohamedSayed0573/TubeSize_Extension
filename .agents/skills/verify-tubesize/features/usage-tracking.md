# All-sites usage tracking & watch history

All-sites usage tracking measures actual network bytes transferred on every visited website using dual-path accounting (fixed `Content-Length` responses plus streamed `fetch`, `XMLHttpRequest`, `WebSocket`, `RTCPeerConnection`, and classic or `type: "module"` `blob:` `Worker` traffic), records daily totals in IndexedDB `siteUsage`, attributes countable traffic on supported watch pages to `watchHistory` (with lazy single-flight `videoMetaData` across both accounting paths), and normalizes origins into site keys and labels.

## Sub-features

- `tracking-webrequest` counts responses carrying a positive `Content-Length` header per tab origin and flushes batched totals to `siteUsage`.
- `tracking-fetch-stream` counts chunked/streamed `fetch()` response bodies that lack `Content-Length` via the `MAIN`-world observer and `usageBridge`.
- `tracking-xhr-stream` counts incremental `XMLHttpRequest` progress for streamed responses without `Content-Length`.
- `tracking-websocket` counts incoming and outgoing `WebSocket` text and binary frames in pages and re-hosted `blob:` `Worker`s.
- `tracking-webrtc` samples `RTCPeerConnection.getStats()` periodic byte deltas on one locked tier (`transport`, `candidate-pair`, or `stream`) so RTP media and `RTCDataChannel` traffic are counted without double counting.
- `tracking-worker-stream` re-hosts classic and `type: "module"` `blob:` `Worker`s (safe under immediate `URL.revokeObjectURL`) to count worker-side `fetch()`, `XMLHttpRequest`, and `WebSocket` traffic.
- `tracking-dedup-exclusions` avoids double-counting `Content-Length` responses across both paths and ignores `HEAD` requests, cached responses, and extension-origin URLs.
- `tracking-watch-history` attributes countable tab traffic on YouTube, Twitch, and Kick watch pages to `watchHistory` (`<platform>:<mediaId>`) and lazily records single-flight `videoMetaData` across both `webRequest` and `usageBridge` traffic.
- `tracking-site-normalization` merges subdomains like `www.example.com` and `m.example.com` while keeping Google product subdomains (`drive.google.com`, `mail.google.com`) distinct.

## How to get to it (user POV)

- Browse any `http://` or `https://` website, including real-time call apps using `WebSocket` or `WebRTC`, while TubeSize is installed, then inspect Today's total and per-site usage in the toolbar popup or Dashboard (`dashboard.html#/today`).
- Watch a video or live stream on YouTube, Twitch, or Kick, then open `dashboard.html#/platform/<youtube|twitch|kick>` to see per-video data consumption and metadata.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify dual-path all-sites byte accounting without double counting.** Run `bun run verify start --target fixture:usage-site --seed empty`, `bun run verify click --role button --name "Run all usage paths"`, `bun run verify wait --text "Done: 570000 bytes expected"`, `bun run verify wait --ms 6500`, and `bun run verify state`. Observable result: `Today:` shows exact `http://127.0.0.1:<port>=570000` (200,000 fixed `Content-Length` + 150,000 chunked `fetch` + 100,000 chunked XHR + 120,000 `blob:` Worker; the 200,000 `HEAD` request is excluded and nothing is double-counted) with `Errors: 0`.
- **Verify WebSocket, module `blob:` Worker, and WebRTC loopback call tracking.** Run `bun run verify goto fixture:realtime-call`, `bun run verify seed empty`, `bun run verify click --role button --name "Run full call simulation"`, `bun run verify wait --text "Full call simulation done"`, `bun run verify wait --ms 4000`, and `bun run verify state`. Observable result: `ws-status` reports `"WebSocket 140013 done"`, `worker-status` reports `"Module worker 140013 done"`, `webrtc-status` reports `"WebRTC call done: <total> transport bytes"`, and `Today:` records `280026` bytes plus the WebRTC loopback transport total (within 85% to 125% of reported transport bytes) with `Errors: 0`. This flow also runs automatically as the `realtime-call` step in `bun run verify smoke`.
- **Verify all-sites dashboard visibility after live capture.** Run `bun run verify goto today`, `bun run verify snapshot .verify-evidence/usage-tracking/today.aria.txt`, and `bun run verify screenshot .verify-evidence/usage-tracking/today.png`. Observable result: `AllSitesTable` displays `http://127.0.0.1:<port>` with the captured byte total (`100.0%`) and `newErrors=0`.
- **Verify watch-history attribution and lazy video metadata on YouTube.** Run `bun run verify goto fixture:youtube-vod`, `bun run verify click --role button --name "Trigger media traffic 150 KB"`, `bun run verify wait --text "Sent 150000 bytes"`, `bun run verify wait --ms 4500`, and `bun run verify state`. Observable result: `Today:` includes `https://www.youtube.com` (`>=150000` bytes), `Watch:` records `youtube:I82j7AzMU80`, and `DB:` reports `1 videos` in `videoMetaData` (`Errors: 0`).
- **Verify watched video row in Dashboard.** Run `bun run verify goto platform:youtube`, `bun run verify snapshot .verify-evidence/usage-tracking/youtube-history.aria.txt`, and `bun run verify screenshot .verify-evidence/usage-tracking/youtube-history.png`. Observable result: table renders `"How does Claude Code *actually* work?"` by `"Theo - t3․gg"` (`newErrors=0`).
- **Verify Google subdomain separation.** Run `bun run verify goto fixture:google-drive`, `bun run verify click --role button --name "Trigger Drive traffic 250 KB"`, `bun run verify wait --text "Drive 250000 done"`, `bun run verify wait --ms 4500`, `bun run verify popup open`, `bun run verify snapshot`, and `bun run verify state`. Observable result: toolbar popup displays `"Google Drive Usage 250.6 KB"` (250,000-byte fetch plus the ~620 B fixture HTML document) cleanly with `Errors: 0`.
- **Verify domain normalization and accounting unit rules.** Run `bun run test`. Observable result: `src/tests/domain.test.ts`, `src/tests/usageTracker.test.ts`, `src/tests/usageBridge.test.ts`, `src/tests/usageIngestion.test.ts`, `src/tests/pageUsageObserver.test.ts`, and `src/tests/videoMetadata.test.ts` pass.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Re-hosted `blob:` workers forward usage immediately to the page-world observer (`setInterval(..., 3000)`), which relays through `UsageBridge` into `UsageIngestion` (flushing immediately), while `Content-Length` `webRequest` traffic flushes via `UsageIngestion` (`setInterval(..., 3000)`); always wait at least `4000 ms` (or `6500 ms` for combined `webRequest` + worker flows) after traffic completes before asserting `state`.
- On `fixture:usage-site` and `fixture:realtime-call`, the page document itself is served as a chunked stream without `Content-Length` so initial navigation HTML does not alter the expected byte counts.
- `UsageIngestion` flushes buffered `webRequest` `siteUsage` and `watchHistory` inside `setInterval` in the background service worker; in long-lived sessions keep the session alive during the 3–4.5s flush window rather than calling `stop` immediately.
