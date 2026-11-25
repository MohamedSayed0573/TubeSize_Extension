# Settings & persistence

Settings lets a user configure TubeSize's UI language (English or Arabic RTL), enable or disable the hourly video data usage alert, adjust the 200–1000 MB/hour threshold slider, and toggle Advanced View for codec/itag details in the popup, with all preferences saved in `chrome.storage.sync`.

## Sub-features

- `settings-open-back` opens Settings from the popup header button and returns cleanly via the `Back` link.
- `settings-advanced-view` toggles `Enable advanced view` and persists `advancedView` across reloads.
- `settings-toaster-alert` enables or disables `Enable video usage limit exceeded alert` and adjusts the 200–1000 MB/hour slider (`#toasterThreshold`).
- `settings-toaster-disabled-slider` disables `#toasterThreshold` (`group "Usage limit"`, labeled `Usage Limit (MB/hour): <threshold>`) when the usage alert switch is unchecked.
- `settings-language-rtl` switches UI language (`combobox "Language"`) between `English` (`dir=ltr`) and `العربية` (`dir=rtl`).
- `settings-footer-links` renders `GitHub` and `Support Me` links in the settings footer.

## How to get to it (user POV)

- Click the TubeSize extension icon (or press `Alt+P`) to open the popup, then click `Settings` in the popup header.
- Navigate directly to `chrome-extension://<extId>/popup.html#/settings`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Launch popup, navigate to Settings, and test Back link.** Run `bun run verify start --target popup --seed full`, capture `bun run verify screenshot .verify-evidence/settings/1-popup.png`, click `bun run verify click --role button --name "Settings"`, verify `Back` link returns to `popup.html#/` via `bun run verify click --role link --name "Back"`, then re-enter via `bun run verify click --role button --name "Settings"`. Observable result: navigates cleanly between `popup.html#/` and `popup.html#/settings` with `newErrors=0`.
- **Toggle Advanced View.** Run `bun run verify click --role switch --name "Enable advanced view"` and `bun run verify screenshot .verify-evidence/settings/2-toggled.png`. Observable result: `newErrors=0` and `bun run verify snapshot` shows `switch "Enable advanced view" [checked]`.
- **Adjust usage limit slider and verify disabled state when alert is off.** Focus the slider with `bun run verify click --selector '[data-slot="slider-thumb"]'`, run `bun run verify press ArrowRight --repeat 2`, toggle off via `bun run verify click --role switch --name "Enable video usage limit exceeded alert"`, capture `bun run verify snapshot` (confirming slider is `[disabled]`), re-enable it via `bun run verify click --role switch --name "Enable video usage limit exceeded alert"`, and run `bun run verify snapshot .verify-evidence/settings/2-settings-en.aria.txt`. Observable result: `toasterThreshold` updates to `520`, `#toasterThreshold` disables/re-enables with `toasterEnabled`, and the English snapshot shows `Usage Limit (MB/hour): 520`, both switches `[checked]`, and footer links `GitHub` and `Support Me` (`newErrors=0`).
- **Switch language to Arabic RTL.** Run `bun run verify click --role combobox --name "Language"` then `bun run verify click --role option --name "العربية"`. Observable result: page flips to `dir=rtl` with heading `الإعدادات` and Arabic section labels (`اللغة`, `العرض المتقدم`) with `newErrors=0`.
- **Confirm persistence after reload.** Run `bun run verify reload`, `bun run verify state`, `bun run verify snapshot .verify-evidence/settings/3-reloaded.aria.txt`, and `bun run verify screenshot .verify-evidence/settings/3-reloaded.png`. Observable result: `dir=rtl`, `Sync: {"advancedView":true,"language":"ar","toasterEnabled":true,"toasterThreshold":520}`, `Errors: 0`, both Arabic switches (`تفعيل تنبيه تجاوز حد استهلاك الفيديو` and `تفعيل العرض المتقدم`) remain `[checked]`, slider remains `520`, and footer links render `GitHub` and `ادعمني`.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `@base-ui/react` puts `id="advancedViewToggle"` and `id="toasterThresholdToggle"` on hidden internal checkbox inputs while interactive controls are `[role="switch"]`; always target `--role switch --name "..."` (or CSS `label[for="..."] ~ [role="switch"]`).
- Base UI `Slider` uses an `<input type="range">` (implicit ARIA role `slider`, no `role="slider"` attribute); target `--selector '[data-slot="slider-thumb"]'` to focus the rendered thumb for keyboard adjustments.
- `includeAudio` (`Include audio in sizes`) does not appear on the Settings page — it lives inside the Popup when `Enable advanced view` is enabled on a YouTube video tab (verified in [Platform size estimation](./platform-size-estimation.md)).
- Checking the switch immediately after clicking is not enough; always run `bun run verify reload` and confirm both DOM (`snapshot`) and `chrome.storage.sync` (`state`) persisted.
