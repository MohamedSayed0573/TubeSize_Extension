# Popup & video size inspector

The Popup is the primary toolbar surface (`Alt+P` or extension icon), showing video download size estimates by quality/codec on active YouTube, Twitch, and Kick tabs, a graceful unsupported-page state on other tabs, and quick links to Settings and the Usage Dashboard.

## Sub-features

- `popup-header` displays the title (or active video title + duration / `LIVE` badge) plus `Settings` and `Dashboard` action buttons.
- `popup-unsupported` displays `UnsupportedPage` (with Today's total usage button) when the active tab is not YouTube, Twitch, or Kick.
- `popup-platform-formats` displays per-resolution video/audio size estimates (`FormatView`, `AdvancedFormatItem` when Advanced View is enabled) on supported video pages.
- `popup-changelog-notice` displays a one-time notice when `local:lastSeenVersion` differs from the installed extension version.

## How to get to it (user POV)

- Click the TubeSize icon in the browser toolbar or press `Alt+P`.
- Open `chrome-extension://<extId>/popup.html#/` directly in a tab (used for automated verification).

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Verify popup boot and unsupported-tab render.** Run `bun run verify start --target popup --seed full`, `bun run verify snapshot .verify-evidence/popup/popup.aria.txt`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/popup/popup.png`. Observable result: `button "Settings"`, `button "Dashboard"`, and today's usage button appear with `Errors: 0`.
- **Verify popup in Arabic RTL.** Run `bun run verify seed full --lang ar`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/popup/popup-ar.png`. Observable result: `dir=rtl`, translated Arabic labels, and `Errors: 0`.
- **Verify platform parsers & size math.** Run `bun run test`. Observable result: `src/tests/youtube.test.ts`, `src/tests/twitch.test.ts`, `src/tests/format.test.ts`, `src/tests/codecSupport.test.ts`, and `src/tests/messaging.test.ts` all pass.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Opening `popup.html#/` as a tab makes `chrome.tabs.query({ active: true, currentWindow: true })` return the popup tab itself, which routes to `UnsupportedPage` — this proves the popup shell, header, usage summary, and RTL layout, **not** `PlatformView` format rows.
- Driving `PlatformView` (`popup-platform-formats`) against live YouTube, Twitch, or Kick requires an active tab on a live video URL and is subject to network availability, consent walls, and bot checks. Never claim `popup-platform-formats` was runtime-verified from `popup.html#/` alone; report the unmet precondition honestly and pair with `bun run test`.
