# Popup shell, usage cards & changelog

The Popup is the primary toolbar surface (`Alt+P` or extension icon), showing header controls to Settings and the Dashboard, clickable Today and active-site usage summary cards, graceful unsupported-page or no-video states, a one-time release changelog notice, and footer links (while active video quality estimation is covered in [Platform size estimation](./platform-size-estimation.md)).

## Sub-features

- `popup-header` displays the title (or active video title + duration / `Live` badge) plus `Settings` and `Dashboard` action buttons.
- `popup-today-usage-card` renders Today's cumulative usage button when `> 0 B` and opens `dashboard.html#/today` on click.
- `popup-site-usage-card` renders the active HTTP/HTTPS origin's usage button (e.g. `Google Drive Usage`) and opens `dashboard.html#/site/<siteKey>` on click.
- `popup-unsupported` displays `Usage tracking is enabled.` and `Open a YouTube, Twitch, or Kick video to see estimated data usage.` when the active tab is not YouTube, Twitch, or Kick.
- `popup-no-running-video` displays `No video is playing. Open a video or stream to see estimated data usage.` on supported platform home/directory pages without a running video.
- `popup-changelog-notice` displays a one-time `New release v<version>` banner when `local:lastSeenVersion` differs from the installed extension version and hides permanently after dismissal.
- `popup-footer-links` renders `GitHub` and `Support Me` links at the bottom of the popup.

## How to get to it (user POV)

- Click the TubeSize icon in the browser toolbar or press `Alt+P` while viewing any website.
- Open `chrome-extension://<extId>/popup.html#/` directly in a tab (shows the popup shell in unsupported-page mode).

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify changelog banner and permanent dismissal.** Run `bun run verify start --target popup --seed full --prev-version 3.0.0`, `bun run verify snapshot .verify-evidence/popup/1-changelog.aria.txt`, `bun run verify click --selector '[role="status"] button'`, `bun run verify reload`, `bun run verify snapshot .verify-evidence/popup/2-dismissed.aria.txt`, and `bun run verify state`. Observable result: initial snapshot shows `New release v3.0.4` and `See what's changed`; after clicking dismiss and reloading, the banner is gone and `Local:` shows `"lastSeenVersion":"3.0.4"` (`Errors: 0`).
- **Verify unsupported-tab state, Today usage card, and footer links.** Run `bun run verify snapshot .verify-evidence/popup/popup.aria.txt`, `bun run verify screenshot .verify-evidence/popup/popup.png`, and click Today's usage card (`bun run verify click --role button --name "Total Usage Today"`). Observable result: unsupported state displays `Usage tracking is enabled.`, `Settings`, `Dashboard`, `GitHub`, and `Support Me`; clicking the Today card opens `dashboard.html#/today` with `Errors: 0`.
- **Verify active-tab Google Drive site usage card and drill-down.** Start from a clean total so the 250 KB is exact: run `bun run verify seed empty`, then `bun run verify goto fixture:google-drive`, `bun run verify click --role button --name "Trigger Drive traffic 250 KB"`, `bun run verify wait --text "Drive 250000 done"`, `bun run verify wait --ms 4500`, `bun run verify popup open`, `bun run verify snapshot .verify-evidence/popup/google-drive-popup.aria.txt`, `bun run verify screenshot .verify-evidence/popup/google-drive-popup.png`, and `bun run verify click --role button --name "Google Drive Usage"`. Observable result: real toolbar popup displays `Google Drive Usage 250 KB` and clicking it opens `dashboard.html#/site/drive.google.com` (`Errors: 0`).
- **Verify popup in Arabic RTL.** Run `bun run verify goto popup`, `bun run verify seed full --lang ar`, `bun run verify state`, `bun run verify snapshot .verify-evidence/popup/popup-ar.aria.txt`, and `bun run verify screenshot .verify-evidence/popup/popup-ar.png`. Observable result: `dir=rtl`, translated Arabic labels (`الإعدادات`, `لوحة الاستخدام`, `إجمالي الاستهلاك اليوم`), and `Errors: 0`.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Opening `popup.html#/` directly via `goto popup` makes the popup tab itself active and routes to `UnsupportedPage` — use `bun run verify popup open` on an HTTP/HTTPS or `fixture:*` tab to verify `PopupUsage` site cards or `PlatformView`.
- On the very first run when `local:lastSeenVersion` is `null`, `ChangelogNotice` silently seeds `lastSeenVersion` to the running version without showing the banner; pass `--prev-version 3.0.0` to `bun run verify start` to trigger the update banner deterministically.
- When `Today`'s usage or the active site's usage is `0 B`, `PopupUsage` renders `null` rather than a `0 B` button; seed `full` or trigger site traffic first.
