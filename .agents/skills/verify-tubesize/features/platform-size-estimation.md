# Platform size estimation (YouTube, Twitch & Kick)

Platform size estimation inspects the active YouTube, Twitch, or Kick tab when the user opens the toolbar popup, resolving media manifests in the background service worker to show estimated download sizes and/or hourly and per-minute data rates per quality tier, highlighting the active playback quality, and exposing developer codec/itag/audio controls in Advanced View.

## Sub-features

- `est-youtube-vod` displays YouTube VOD title, duration, `Current` quality badge, total MB/GB and MB/min per resolution, and persists cache under `local:youtube:<id>`.
- `est-youtube-shorts` displays Shorts quality sizes with `hideRate: true` (total size only, omitting `/min`).
- `est-youtube-live` displays YouTube Live channel header, pulsing `Live` badge, and `/hour` + `/min` data rates, cached for `LIVE_CACHE_TTL` (5 min).
- `est-youtube-advanced-audio` reveals codec, itag, and fps details, hover itag tooltips, the standalone `Audio` row, and the `Include audio in sizes` switch when Advanced View is enabled.
- `est-youtube-av1-codec` switches formats above `1080p` between `AV1` and `VP9`/`AVC` depending on hardware `MediaCapabilities` AV1 support.
- `est-twitch-vod` resolves Twitch VOD GQL token + master M3U8 to display `Twitch Video`, duration, total size, and `/min` rate per quality, cached under `local:twitch:<vodId>`.
- `est-twitch-live-hls` runs `Range: bytes=0-0` HLS segment sampling (`isFromPopup: true`) on clean Twitch live streams without caching live results.
- `est-twitch-live-ads-fallback` detects non-live/ad segments (`liveSegments.length < 4`) and falls back to Master M3U8 `BANDWIDTH` estimates.
- `est-kick-vod` resolves both UUID (`/api/v1/video/<uuid>`) and slug (`/api/v2/channels/<channel>/videos`) Kick VODs and caches under `local:kick:<vodId>`.
- `est-kick-live-hls` runs HLS segment sampling for Kick live channels without caching live results.
- `est-platform-no-video` renders `"No video is playing. Open a video or stream to see estimated data usage."` on platform non-video pages (`youtube.com/`, `twitch.tv/directory`, `kick.com/browse`).

## How to get to it (user POV)

- Open a YouTube video/Shorts/live stream, Twitch stream/VOD, or Kick stream/VOD in the browser tab and click the TubeSize toolbar icon (or press `Alt+P`).
- Toggle `Enable advanced view` in Settings to inspect codecs, itags, fps tooltips, and toggle `Include audio in sizes`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify YouTube VOD size estimation and Current badge in real popup.** Run `bun run verify start --target fixture:youtube-vod --seed empty`, `bun run verify popup open`, `bun run verify snapshot .verify-evidence/platform-estimation/youtube-vod.aria.txt`, `bun run verify screenshot .verify-evidence/platform-estimation/youtube-vod.png`, and `bun run verify state`. Observable result: popup shows `"How does Claude Code *actually* work?"` (`39m 23s`), `1080p Current` at `100.92 MB` / `2.56 MB/min`, `2160p` at `862.67 MB`, and `Local:` lists `"youtube:I82j7AzMU80"` in `mediaCacheKeys` (`Errors: 0`).
- **Verify Advanced View codecs, itag tooltip, and Include audio toggle.** From the open popup, click `button "Settings"`, click `switch "Enable advanced view"`, click `link "Back"`, hover a format row with `bun run verify hover --role button --name "720p"`, run `bun run verify snapshot .verify-evidence/platform-estimation/youtube-vod-advanced.aria.txt`, then run `bun run verify click --role switch --name "Include audio in sizes"`, `bun run verify snapshot .verify-evidence/platform-estimation/youtube-vod-no-audio.aria.txt`, `bun run verify screenshot .verify-evidence/platform-estimation/youtube-vod-advanced.png`, and `bun run verify popup close`. Observable result: `1080p` shows `AV1 itag 399 30fps`, `Audio Opus itag 251 39.81 MB`, hovering `720p` opens its `720p itags` list tooltip (`itag 136`, `itag 247`, `itag 398`), and toggling `Include audio in sizes` off drops `1080p` from `100.92 MB` to `61.11 MB` (`newErrors=0`).
- **Verify YouTube Shorts and YouTube Live.** Run `bun run verify goto fixture:youtube-shorts`, `bun run verify popup open`, `bun run verify snapshot` (confirm `hideRate: true`: no `/min` text), `bun run verify popup close`, then `bun run verify goto fixture:youtube-live`, `bun run verify popup open`, `bun run verify snapshot .verify-evidence/platform-estimation/youtube-live.aria.txt`, `bun run verify state`, and `bun run verify popup close`. Observable result: Shorts omits `/min` rates; Live displays `Think Planes`, `Live` badge, `/hour` + `/min` rates, `AAC itag 140` (while `advancedView` remains enabled from the previous step), and caches `"youtube:feSFplc7tMY"` in `mediaCacheKeys` (`Errors: 0`).
- **Verify Twitch Live HLS segment sampling, ad fallback, and VOD.** Run `bun run verify goto fixture:twitch-live`, `bun run verify popup open`, `bun run verify snapshot .verify-evidence/platform-estimation/twitch-live.aria.txt`, `bun run verify screenshot .verify-evidence/platform-estimation/twitch-live.png`, `bun run verify state`, `bun run verify popup close`. Then run `bun run verify goto fixture:twitch-live-ads`, `bun run verify popup open`, `bun run verify snapshot`, `bun run verify popup close`, then `bun run verify goto fixture:twitch-vod`, `bun run verify popup open`, `bun run verify snapshot`, `bun run verify state`, `bun run verify popup close`. Observable result: `twitch-live` reports `1080p` at `2.7 GB/hour` (`45 MB/min`) from real `206 Content-Range` segment probes and is **not** in `mediaCacheKeys`; `twitch-live-ads` falls back to Master M3U8 `BANDWIDTH` (`1.8 GB/hour`); `twitch-vod` shows `Twitch Video` (`1h`) with `1.8 GB` (`30 MB/min`) at `1080p` and caches `"twitch:2748008198"` (`Errors: 0`).
- **Verify Kick Live HLS sampling and UUID + slug VODs.** Run `bun run verify goto fixture:kick-live`, `bun run verify popup open`, `bun run verify snapshot .verify-evidence/platform-estimation/kick-live.aria.txt`, `bun run verify screenshot .verify-evidence/platform-estimation/kick-live.png`, `bun run verify popup close`. Then verify `fixture:kick-vod` (`11111111-2222-3333-4444-555555555555`) and `fixture:kick-vod-slug` (`c7093a5c-demo-vod`) each with `popup open`, `snapshot`, `state`, and `popup close`. Observable result: `kick-live` reports `2.7 GB/hour` from HLS sampling without caching; both Kick VOD formats resolve and cache under `kick:<vodId>` (`Errors: 0`).
- **Verify platform non-video pages.** Run `bun run verify goto fixture:youtube-home`, `bun run verify popup open`, `bun run verify snapshot`, and `bun run verify popup close` (and similarly `fixture:twitch-directory`, `fixture:kick-browse`). Observable result: popup renders `"No video is playing. Open a video or stream to see estimated data usage."` (`newErrors=0`).
- **Verify parser, HLS, cache & codec unit tests.** Run `bun run test`. Observable result: `youtube.test.ts`, `twitch.test.ts`, `kick.test.ts`, `hlsSize.test.ts`, `storageService.test.ts`, `codecSupport.test.ts`, and `format.test.ts` pass.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Opening `popup.html#/` directly via `bun run verify goto popup` makes the popup tab itself active and always routes to `UnsupportedPage`; always use `bun run verify popup open` on a `fixture:*` tab to exercise `PlatformView` (`chrome.tabs.query({ active: true, currentWindow: true })`).
- `scripts/verify/browser.ts` launches Chromium with `--disable-gpu`, which deterministically makes `navigator.mediaCapabilities.decodingInfo` report `av1: false`, so `2160p` and `1440p` select `VP9` (`313`/`271`) instead of `AV1` (`401`/`400`); `src/tests/youtube.test.ts` + `src/tests/codecSupport.test.ts` cover both `av1Supported = true` and `false`.
- `fixture:*` targets verify TubeSize's real built code offline against deterministic network-boundary fixtures; live internet tests against upstream `youtube.com`/`twitch.tv`/`kick.com` depend on upstream page/API stability, Cloudflare/bot checks, and active broadcasts.
