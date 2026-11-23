# Performance & memory

Performance & memory verification measures TubeSize's real runtime responsiveness and resource footprint — including how long the toolbar popup takes to display size estimations on uncached vs cached videos, how long the Dashboard takes from navigation until IndexedDB data and charts render, how much V8 heap / Chromium RSS / storage the extension consumes, and the built MV3 bundle size.

## Sub-features

- `perf-popup-uncached` measures real toolbar popup latency (`openToSettledMs` and internal `popupNavToSettledMs`) on YouTube, Twitch, and Kick tabs with media caches cleared before every run.
- `perf-popup-cached` warms the media cache once and measures repeat popup open latency for direct uncached-vs-cached comparison.
- `perf-dashboard-load` measures cold navigation (`about:blank` → `dashboard.html#/...`) until IndexedDB queries settle and Recharts bars or tables render, under both `full` (14-day) and `heavy` (90-day) datasets.
- `perf-memory-footprint` reports MV3 background service worker V8 heap (`Runtime.getHeapUsage`), active page JS heap, DOM node & event listener counts (`Performance.getMetrics`), `chrome.storage` bytes, IndexedDB size, and session Chromium process RSS.
- `perf-bundle-size` audits uncompressed `.output/chrome-mv3` and `.output/firefox-mv3` bundle totals, category breakdowns, and largest emitted files in decimal SI units.

## How to get to it (user POV)

- Click the TubeSize toolbar icon (`Alt+P`) on a freshly opened YouTube, Twitch, or Kick video (uncached) and again on a revisit (cached) to observe popup estimation latency.
- Click `Dashboard` in the popup header to observe time-to-data for daily/site charts and platform tables.
- Open Chrome's Task Manager (`Shift+Esc`) or `chrome://extensions` to inspect extension memory usage.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Measure built bundle sizes (no browser session required).** Run `bun run verify perf bundle --save .verify-evidence/performance/bundle.json`. Observable result: prints `chrome-mv3` (and `firefox-mv3` if built) total SI size, category totals (`background`, `contentScripts`, `chunks`, `assets`, etc.), and largest files, saving JSON to `.verify-evidence/performance/bundle.json`.
- **Measure uncached vs cached popup size estimation latency.** Run `bun run verify start --target fixture:youtube-vod --seed empty`, `bun run verify perf popup --target fixture:youtube-vod --runs 3 --save .verify-evidence/performance/popup-yt-uncached.json`, `bun run verify perf popup --target fixture:youtube-vod --runs 3 --cached --save .verify-evidence/performance/popup-yt-cached.json`, and `bun run verify perf popup --target fixture:twitch-live --runs 3 --save .verify-evidence/performance/popup-twitch-live.json`. Observable result: reports `min`/`median`/`p95`/`max` for both `popupNavToSettledMs` (pure internal popup time) and `openToSettledMs` (including `openPopup()` + CDP attach), popup heap/DOM nodes, and `Errors: 0`.
- **Measure cold Dashboard load latency (standard 14-day and heavy 90-day datasets).** Run `bun run verify perf dashboard --target daily --seed full --runs 3 --save .verify-evidence/performance/dashboard-daily-full.json`, `bun run verify perf dashboard --target daily --seed heavy --runs 3 --save .verify-evidence/performance/dashboard-daily-heavy.json`, and `bun run verify perf dashboard --target sites --runs 3`. Observable result: reports cold `navToDataReadyMs`, `wallToDataReadyMs`, `domContentLoadedMs`, `fcpMs`, and Dashboard JS heap / DOM node counts with `Errors: 0`.
- **Measure extension memory and storage footprint.** Run `bun run verify perf memory --save .verify-evidence/performance/memory.json`. Observable result: reports `background.js` V8 heap (`usedHeapBytes` / `totalHeapBytes` / `embedderHeapUsedBytes`), active page heap/nodes/listeners, `chrome.storage.local` + `sync` bytes, IndexedDB counts, and session Chromium `VmRSS` by process type (`Errors: 0`).
- **Run the combined benchmark suite.** Run `bun run verify perf all --runs 3 --save .verify-evidence/performance/all.json`. Observable result: runs bundle, YouTube VOD uncached/cached, Twitch Live uncached, Dashboard `daily`/`sites`, and memory benchmarks in one pass with `Errors: 0`.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `popupNavToSettledMs` (from `performance.now()` inside `popup.html`) is the cleanest indicator of extension code + parsing speed; `openToSettledMs` additionally includes Chromium's `chrome.action.openPopup()` window creation and Playwright's `connectOverCDP` polling (~50–200 ms).
- `fixture:*` targets fulfill network requests locally, so uncached popup timings reflect TubeSize's real manifest parsing, Zod validation, codec detection, storage I/O, and React rendering without internet RTT noise; live-network latency on public YouTube/Twitch/Kick adds upstream network RTT on top.
- `chromiumProcesses` `VmRSS` reads Linux `/proc/<pid>/status` and is `null` on macOS/Windows; V8 heap metrics (`serviceWorker`, `activePage`) and `chrome.storage` bytes work cross-platform via CDP and Chrome APIs.
- Always run `bun run build` before `perf bundle` or `perf all` so you benchmark the current build rather than stale `.output/` artifacts.
