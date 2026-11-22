---
name: verify-tubesize
description: "Verify TubeSize (MV3 Chromium/Firefox browser extension) at runtime by launching the built extension in an isolated headless Chromium instance via Playwright, seeding IndexedDB/storage, driving real user flows, auditing page and network errors, and capturing inspectable proof artifacts. Use whenever verifying UI, settings, dashboard, routing, i18n/RTL, storage, or IndexedDB changes in this repo."
---

# Verify TubeSize

TubeSize is a WXT + React + Dexie Manifest V3 browser extension targeting Chromium (primary runtime verification surface via `playwright-core` `--load-extension`) and Firefox (`bun run build:firefox` static/manifest verification).

A green `tsc` / `bun test` / `wxt build` proves code compiles — it does **not** prove the built extension loads, renders, or persists state at runtime. Use this skill and the feature map in [features/README.md](./features/README.md) to prove user-facing behavior before claiming work is done.

## Launch

Build the extension (or pass `--build` to `bun run verify start`):

```bash
bun run build
```

Start an isolated Playwright browser session with `.output/chrome-mv3` loaded:

```bash
bun run verify start [--target daily|popup|settings|...] [--seed full|empty] [--lang en|ar] [--build]
```

What `start` does:

- Discovers Chromium via `CHROME_PATH`, newest `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`, or system `google-chrome` / `chromium`.
- Launches `chromium.launchPersistentContext` in `--headless=new` with an ephemeral profile (`ts-verify-*` under a short safe `TMPDIR`), `acceptDownloads: true`, and `--disable-extensions-except=.output/chrome-mv3 --load-extension=.output/chrome-mv3`.
- **Readiness criteria:** waits for the MV3 background service worker (`chrome-extension://<extId>/background.js`) to come online, seeds IndexedDB (`full` = 14 deterministic days + 6 video metadata records, or `empty`), sets `chrome.storage.sync.language`, opens the initial target, and waits until `#root` renders with no `[data-slot="skeleton"]` or `.animate-spin` elements and `document.fonts.ready` settles.
- **Isolation:** Uses an ephemeral profile and ephemeral localhost port (`127.0.0.1:0`), never touching the user's personal browser. One active session runs at a time; calling `start` again cleanly stops any prior session first.

## Doctor

Run this first whenever starting a verification session or whenever anything looks off:

```bash
bun run verify doctor
```

`doctor` is read-only and checks:

1. `bun` runtime version.
2. `chromium` executable path.
3. `.output/chrome-mv3/manifest.json` presence and freshness (warns if `src/` is newer than the build).
4. Fresh MV3 boot: launches isolated Chromium, confirms `background.js` comes online, opens `popup.html#/`, asserts zero `pageerror`, `console.error`, extension `requestfailed`, or React error boundary, then tears down cleanly.

Exit codes across all `verify` commands:

- `0` — Verified / passed.
- `1` — Failed (runtime error, error boundary, or failed action).
- `2` — **Inconclusive** (missing Chromium, missing `.output/chrome-mv3`, or no active session). Report `inconclusive` honestly; never fake confidence.

## Drive

Read [features/README.md](./features/README.md) first, then follow the matching feature recipe.

### Static & Unit Checks (from `package.json`)

```bash
bun run tsc && bun run lint --max-warnings=0 && bun run test && bun run build && bun run knip
# For manifest/Firefox-sensitive changes, also run:
bun run build:firefox
```

### Interactive Playwright Commands

```bash
bun run verify status                                         # Check session health & error count
bun run verify goto <target>                                  # popup|settings|daily|sites|today|date:*|platform:*|site:*|URL
bun run verify snapshot [path.aria.txt]                       # Print ARIA accessibility tree (roles & names)
bun run verify click --role button --name "Settings"          # Also supports --label, --text, --selector
bun run verify fill --role textbox --name "Search" --value "Python"
bun run verify press Enter
bun run verify reload                                         # Reload and wait for UI settle
bun run verify seed <full|empty> [--lang en|ar]               # Re-seed IndexedDB / language & reload
bun run verify state                                          # URL, dir, IndexedDB counts, chrome.storage.sync, errors
bun run verify screenshot .verify-evidence/<name>.png         # Capture 2x PNG proof
```

### Stable Handles in This Repo

- Popup header actions: `button "Settings"`, `button "Dashboard"`
- Settings language combobox: `combobox "Language"` (`#language-select`, options `English` / `العربية`)
- Settings usage alert: `switch "Enable video usage limit exceeded alert"`, `#toasterThreshold` slider (200–1000)
- Settings advanced view: `switch "Enable advanced view"` (CSS fallback: `label[for="advancedViewToggle"] ~ [role="switch"]`)
- Dashboard chart tabs: `link "By Day"` (`a[href="#/daily"]`), `link "By Site"` (`a[href="#/sites"]`)
- Dashboard footer actions: `button "Clear All Usage Data"`, `button "Export To JSON"`, `button "Import JSON"`, dialog confirm `button "Continue"`

## Evidence

Save proof artifacts under `.verify-evidence/<feature-or-task>/` (gitignored and excluded from release zips):

- Capture **both the action and the resulting state** (not only the final screen).
- Include ARIA snapshots (`snapshot <path.aria.txt>`), 2× screenshots (`screenshot <path.png>`), and `state` output showing IndexedDB counts, `chrome.storage.sync`, `dir` (`ltr`/`rtl`), and `Errors: 0`.
- For mutations (settings toggles, language switch, clear/import), always run `reload` followed by `state` + `snapshot` to prove persistence across reload.
- For layout or copy changes, verify both `--lang en` (`dir=ltr`) and `--lang ar` (`dir=rtl`).
- If a path cannot be driven (e.g., live YouTube/Twitch/Kick playback behind bot checks or offline networks), report it as unreachable/inconclusive with the unmet precondition — never weaken a journey or claim an untested entry point passed.

## Cleanup

Always stop the session when done:

```bash
bun run verify stop
```

`stop` closes the Playwright `BrowserContext`, terminates **only** the recorded server PID (never `pkill chrome`), deletes `.verify-evidence/.session.json` and the ephemeral `/tmp/ts-verify-*` profile, and **preserves all screenshots and snapshots in `.verify-evidence/`**. Sessions also auto-exit after 20 minutes of inactivity.

## Helpers

- [scripts/verify.ts](../../../scripts/verify.ts) — CLI entrypoint (`bun run verify --help`).
- [scripts/verify/browser.ts](../../../scripts/verify/browser.ts) — Chromium discovery, isolated Playwright MV3 launcher, route resolution, settle & DOM audit helpers.
- [scripts/verify/seed.ts](../../../scripts/verify/seed.ts) — Deterministic 14-day IndexedDB seeder (compatible with Dexie `version(1)` / IndexedDB `10+`) and `inspectDb`.
- [scripts/verify/server.ts](../../../scripts/verify/server.ts) — Detached localhost HTTP server keeping the Playwright session warm between CLI commands.
