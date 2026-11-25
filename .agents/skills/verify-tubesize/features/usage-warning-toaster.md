# Usage warning toaster

The usage warning toaster is an in-page alert banner (`#TubeSize-Toast-Host`) injected on YouTube, Twitch, and Kick watch pages whenever the playing video's hourly data rate (`megabytesPerHour`) exceeds the user's `toasterThreshold` setting (default `500 MB/hour`), allowing temporary dismissal or same-day suppression.

## Sub-features

- `toaster-trigger-threshold` renders `#TubeSize-Toast-Host` showing current quality, total size (VOD only), per-hour rate, and threshold when playback exceeds `toasterThreshold`.
- `toaster-below-threshold` suppresses rendering when the active resolution's hourly data rate is at or below `toasterThreshold`.
- `toaster-live-omits-total` omits the `Total Usage:` line on live streams while keeping `Current Quality:` and `Per Hour Usage:`.
- `toaster-resolution-change` detects `<video>` `resize` events and triggers the toast when the user switches up to a high-bitrate resolution.
- `toaster-dismiss-ok` unmounts the toast on `OK` without writing `toasterSuppressedDate`.
- `toaster-suppress-today` unmounts the toast on `Don't show again for today`, persists today's `YYYY-MM-DD` date to `local:toasterSuppressedDate`, and prevents re-showing across page reloads.
- `toaster-disabled-setting` suppresses all toasts when `Enable video usage limit exceeded alert` (`sync:toasterEnabled`) is off.
- `toaster-spa-unmount` unmounts `#TubeSize-Toast-Host` and cancels in-flight suppression/resolution checks on YouTube `yt-navigate-finish` SPA navigations.
- `toaster-rtl` renders translated Arabic copy and `dir="rtl"` inside `.container` when language is set to `ar`.

## How to get to it (user POV)

- Open a YouTube, Twitch, or Kick video or live stream whose selected resolution exceeds the hourly threshold configured in Settings (`Video Usage Limit Exceeded Alert`).
- Click `OK` to dismiss once, or `Don't show again for today` to mute warnings until tomorrow.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify below-threshold video stays quiet and resolution upshift triggers VOD toast.** Run `bun run verify start --target fixture:youtube-vod --seed empty`, check `bun run verify snapshot` (no `TubeSize | Warning: High Data Usage` at `1080p`, which is `154 MB/hour <= 500`), then run `bun run verify click --role button --name "Set video 2160p"`, `bun run verify wait --selector "#TubeSize-Toast-Host"`, `bun run verify snapshot .verify-evidence/toaster/vod-toast.aria.txt --selector "#TubeSize-Toast-Host"`, and `bun run verify screenshot .verify-evidence/toaster/vod-toast.png`. Observable result: `#TubeSize-Toast-Host` renders `High Data Usage Detected for 2160p. It crosses your 500 MB/hour threshold.`, `Current Quality: 2160p`, `Total Usage: 862.67 MB`, and `Per Hour Usage: 1.31 GB/hour`, with `newErrors=0`.
- **Verify `OK` dismisses without suppressing today and SPA navigation unmounts stale toasts.** Run `bun run verify click --role button --name "OK"`, `bun run verify wait --selector "#TubeSize-Toast-Host" --gone`, `bun run verify click --role button --name "Set video 1080p"`, `bun run verify wait --ms 300`, `bun run verify click --role button --name "Set video 2160p"`, `bun run verify wait --selector "#TubeSize-Toast-Host"`, then `bun run verify click --role button --name "SPA navigate to Home"` and `bun run verify wait --selector "#TubeSize-Toast-Host" --gone`. Observable result: toast reappears after switching back up to `2160p` (`toasterSuppressedDate` remains `null` in `state`), and navigating to Home unmounts `#TubeSize-Toast-Host` cleanly.
- **Verify `Don't show again for today` persists suppression.** Return via `bun run verify goto fixture:youtube-vod`, click `Set video 2160p`, wait for `#TubeSize-Toast-Host`, then run `bun run verify click --role button --name "Don't show again for today"`, `bun run verify wait --selector "#TubeSize-Toast-Host" --gone`, `bun run verify state`, `bun run verify reload`, `bun run verify click --role button --name "Set video 2160p"`, and `bun run verify wait --ms 600 --selector "#TubeSize-Toast-Host" --gone`. Observable result: `Local:` shows `"toasterSuppressedDate":"YYYY-MM-DD"` (today) and `#TubeSize-Toast-Host` does not mount after reload (`Errors: 0`).
- **Verify live-stream toast omits total size (Twitch & Kick).** Start fresh via `bun run verify start --target fixture:twitch-live --seed empty`, confirm `480p` (`180 MB/hour <= 500`) stays quiet, then run `bun run verify click --role button --name "Set video 1080p"`, `bun run verify wait --selector "#TubeSize-Toast-Host"`, and `bun run verify snapshot --selector "#TubeSize-Toast-Host"`. Repeat for `bun run verify goto fixture:kick-live` + `Set video 1080p`. Observable result: toast shows `Current Quality: 1080p` and `Per Hour Usage: 1.8 GB/hour` with no `Total Usage:` line (`newErrors=0`).
- **Verify Arabic RTL toast and Settings opt-out.** Start with `bun run verify start --target fixture:youtube-vod --seed empty --lang ar`, click `button "Set video 2160p"`, run `bun run verify wait --selector "#TubeSize-Toast-Host"`, `bun run verify snapshot .verify-evidence/toaster/vod-toast-ar.aria.txt --selector "#TubeSize-Toast-Host"`, and `bun run verify screenshot .verify-evidence/toaster/vod-toast-ar.png`. Then disable alerts via `bun run verify goto settings`, click `switch "تفعيل تنبيه تجاوز حد استهلاك الفيديو"` (or `--selector 'label[for="toasterThresholdToggle"] ~ [role="switch"]'`), return via `bun run verify goto fixture:youtube-vod`, click `Set video 2160p`, and run `bun run verify wait --ms 600 --selector "#TubeSize-Toast-Host" --gone` + `bun run verify state`. Observable result: Arabic toast renders RTL (`dir="rtl"` on `#TubeSize-Toast-Host .container`) with `حسنًا` / `لا تعرض مرة أخرى اليوم`, and after disabling in Settings no toast mounts (`Errors: 0`).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `showToast` resolves the current video format strictly by matching `video.videoHeight === format.resolution`. Non-standard cropped aspect ratios whose HTML5 `videoHeight` differs from YouTube's nominal `qualityLabel` height (for example `546` vs `720`) will not match a format row; the fixture uses standard 16:9 heights (`360`, `480`, `720`, `1080`, `2160`).
- `local:toasterSuppressedDate` persists across page reloads in the same browser session — start a fresh session (`verify start`) when testing un-suppressed toast paths after clicking `Don't show again for today`.
- On `fixture:twitch-live` and `fixture:kick-live`, `createContentSession` (`src/entrypoints/content/contentSession.ts`) passes `isFromPopup: false`, so the content-script toaster compares against Master M3U8 `BANDWIDTH` (`180 MB/hour` at `480p`, `1.8 GB/hour` at `1080p`) rather than segment sampling.
- On YouTube, clicking `SPA navigate to Live` while the fixture video stays at `2160p` unmounts the old VOD toast and immediately mounts a new Live toast (`8.17 GB/hour`); navigate to `SPA navigate to Home` to assert `#TubeSize-Toast-Host --gone`.
