# Settings & persistence

Settings lets a user configure TubeSize's UI language (English or Arabic RTL), enable or adjust the hourly video data usage alert threshold, and toggle Advanced View for codec/itag details in the popup, with all preferences saved in `chrome.storage.sync`.

## Sub-features

- `settings-open` opens Settings from the popup header button and returns via the `Back` link.
- `settings-advanced-view` toggles `Enable advanced view` and persists `advancedView` across reloads.
- `settings-toaster-alert` enables or disables `Enable video usage limit exceeded alert` and adjusts the 200–1000 MB/hour slider (`#toasterThreshold`).
- `settings-language-rtl` switches UI language (`combobox "Language"`) between `English` (`dir=ltr`) and `العربية` (`dir=rtl`).

## How to get to it (user POV)

- Click the TubeSize extension icon (or press `Alt+P`) to open the popup, then click `Settings` in the popup header.
- Navigate directly to `chrome-extension://<extId>/popup.html#/settings`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Launch popup and open Settings.** Run `bun run verify start --target popup --seed full`, capture `bun run verify screenshot .verify-evidence/settings/1-popup.png`, then run `bun run verify click --role button --name "Settings"`. Observable result: navigates to `popup.html#/settings` with `newErrors=0`.
- **Toggle Advanced View.** Run `bun run verify click --role switch --name "Enable advanced view"` and `bun run verify screenshot .verify-evidence/settings/2-toggled.png`. Observable result: `newErrors=0` and `bun run verify snapshot` shows `switch "Enable advanced view" [checked]`.
- **Adjust usage limit slider (optional).** Focus the top thumb with `bun run verify click --selector '[data-slot="slider-thumb"]' --nth 1` then run `bun run verify press ArrowRight --repeat 2`. Observable result: `Usage Limit (MB/hour)` increments (e.g. `500` → `520`) and persists `toasterThreshold` in `chrome.storage.sync`.
- **Switch language to Arabic RTL.** Run `bun run verify click --role combobox --name "Language"` then `bun run verify click --role option --name "العربية"`. Observable result: page flips to `dir=rtl` with Arabic headings and `newErrors=0`.
- **Confirm persistence after reload.** Run `bun run verify reload`, `bun run verify state`, `bun run verify snapshot .verify-evidence/settings/3-reloaded.aria.txt`, and `bun run verify screenshot .verify-evidence/settings/3-reloaded.png`. Observable result: `dir=rtl`, `Storage: {"advancedView":true,"language":"ar"}`, `Errors: 0`, and the switch remains `[checked]`.
- **Teardown.** Run `bun run verify stop`. Observable result: session stops cleanly and artifacts under `.verify-evidence/settings/` remain intact.

## Gotchas

- `@base-ui/react` puts `id="advancedViewToggle"` on an internal checkbox input while the interactive control is `[role="switch"]`; always target `--role switch --name "Enable advanced view"` (or CSS `label[for="advancedViewToggle"] ~ [role="switch"]`).
- Checking the switch immediately after clicking is not enough; always run `bun run verify reload` and confirm both DOM (`snapshot`) and `chrome.storage.sync` (`state`) persisted.
- The `Usage Limit (MB/hour)` slider is disabled when `Enable video usage limit exceeded alert` is unchecked.
