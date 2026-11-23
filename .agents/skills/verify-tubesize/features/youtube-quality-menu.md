# YouTube quality menu injection

YouTube quality menu injection embeds estimated file size or hourly rate badges directly alongside resolution labels inside YouTube's native player settings quality menu (`.ytp-settings-menu .ytp-quality-menu`), updating in place and cleaning up automatically across YouTube SPA navigations.

## Sub-features

- `qmenu-vod-badges` injects primary VOD download sizes (for example `2160p` → `862.67 MB`, `1080p` → `100.92 MB`, `720p` → `77.52 MB`) into `.ytp-quality-menu` menu items.
- `qmenu-live-rates` injects hourly bandwidth rates (for example `1080p` → `/hour`) when watching a YouTube Live stream.
- `qmenu-skip-non-standard` leaves non-numeric entries (`Auto`) and `.ytp-premium-label` items (`1080p Premium`) untouched with zero duplicate badges.
- `qmenu-dynamic-open` reacts via `MutationObserver` when `.ytp-quality-menu` is opened after initial video load without causing mutation loops.
- `qmenu-spa-cleanup` handles `yt-navigate-finish` SPA transitions cleanly, removing old `.tubesize-quality-menu-panel` badges on navigation to non-video pages and updating badges on navigation to a new video.

## How to get to it (user POV)

- Open any YouTube video, Shorts, or live stream page, click the player gear icon (`Settings`), and open the `Quality` submenu.
- Navigate via YouTube's client-side links between videos or back to the YouTube Home feed.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify VOD quality menu badges and skipped rows.** Run `bun run verify start --target fixture:youtube-vod --seed empty`, `bun run verify click --role button --name "Open Quality Menu"`, `bun run verify wait --selector ".tubesize-quality-menu-panel"`, `bun run verify snapshot .verify-evidence/youtube-quality-menu/vod.aria.txt --selector ".ytp-settings-menu"`, and `bun run verify screenshot .verify-evidence/youtube-quality-menu/vod.png`. Observable result: `2160p` displays `862.67 MB`, `1080p` displays `100.92 MB`, `720p` displays `77.52 MB`, while `1080p Premium` and `Auto` have no injected size badge (`Errors: 0`).
- **Verify live-stream hourly badges across SPA navigation.** Run `bun run verify click --role button --name "Close Quality Menu"`, `bun run verify click --role button --name "SPA navigate to Live"`, `bun run verify wait --ms 600`, `bun run verify click --role button --name "Open Quality Menu"`, `bun run verify wait --selector ".tubesize-quality-menu-panel"`, `bun run verify snapshot .verify-evidence/youtube-quality-menu/live.aria.txt --selector ".ytp-settings-menu"`, and `bun run verify screenshot .verify-evidence/youtube-quality-menu/live.png`. Observable result: quality items show `/hour` rates from the live stream payload instead of the previous VOD's sizes (`Errors: 0`).
- **Verify SPA navigation cleanup to non-video page.** Run `bun run verify click --role button --name "SPA navigate to Home"` and `bun run verify wait --selector ".tubesize-quality-menu-panel" --gone`. Observable result: all `.tubesize-quality-menu-panel` elements are removed and no runtime errors occur (`Errors: 0`).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `injectMenu()` waits up to `5000 ms` (`SETTINGS_WAIT_TIMEOUT`) for `.ytp-settings-menu` to exist in the DOM; the container must be present shortly after navigation finishes.
- `qualityMenuInjector` matches menu rows by `parseInt(span.textContent)` and reads primary size from `adapter.formats(data)` (always including audio — `formatDisplaySizes(format).primary`).
- On live `youtube.com`, YouTube frequently changes player DOM classes or injects A/B premium labels; `fixture:youtube-*` proves TubeSize's injector against the expected `.ytp-settings-menu > .ytp-panel.ytp-quality-menu > .ytp-panel-menu > .ytp-menuitem-label` structure.
