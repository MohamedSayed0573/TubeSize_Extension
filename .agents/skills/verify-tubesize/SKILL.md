---
name: verify-tubesize
description: "Verify TubeSize (MV3 Chromium/Firefox browser extension) at runtime by launching the built extension in an isolated headless Chromium instance via Playwright, seeding IndexedDB/storage, driving real user flows across all-sites usage tracking, toolbar badge, in-page usage warning toaster, YouTube quality menu injection, YouTube/Twitch/Kick size estimation (via real toolbar popup), settings, dashboard, routing, i18n/RTL, storage/IndexedDB, and Firefox MV3 parity, auditing errors, and capturing inspectable proof artifacts. Use whenever verifying any user-facing TubeSize behavior or build/extension change in this repo."
---

# Verify TubeSize

TubeSize is a WXT + React + Dexie Manifest V3 browser extension targeting Chromium (primary runtime verification surface via `playwright-core` `--load-extension` + CDP popup attachment) and Firefox (`bun run build:firefox` manifest/bundle verification).

A green `tsc` / `bun test` / `wxt build` proves code compiles — it does **not** prove the built extension loads, injects content scripts, counts network bytes, displays the badge/toaster/quality menu, opens the toolbar popup against an active tab, or persists state at runtime. Use this skill and the feature map in [features/README.md](./features/README.md) to prove user-facing behavior before claiming work is done.

## Launch

Build the extension (or pass `--build` to `bun run verify start`):

```bash
bun run build
```

Start an isolated Playwright browser session with `.output/chrome-mv3` loaded:

```bash
bun run verify start [--target daily|popup|settings|fixture:*|...] [--seed full|empty] [--lang en|ar] [--prev-version <semver>] [--build]
```

What `start` does:

- Discovers Chromium via `CHROME_PATH`, newest `~/.cache/ms-playwright/chromium-*/chrome-linux64/chrome`, or system `google-chrome` / `chromium`.
- Launches `chromium.launchPersistentContext` in `--headless=new` with an ephemeral profile (`ts-verify-*` under a short safe `TMPDIR`), `--remote-debugging-port` on an ephemeral port (for real toolbar popup attachment via `chrome.action.openPopup()`), `acceptDownloads: true`, and `--disable-extensions-except=.output/chrome-mv3 --load-extension=.output/chrome-mv3`.
- **Readiness criteria:** waits for the MV3 background service worker (`chrome-extension://<extId>/background.js`) to come online, seeds IndexedDB via the service worker (`full` = 14 deterministic days + 6 video metadata records, or `empty`), sets `chrome.storage.sync.language` (and optional `lastSeenVersion` when `--prev-version` is passed), opens the initial target, and waits until content renders with no `[data-slot="skeleton"]` or `.animate-spin` elements and `document.fonts.ready` settles.
- **Network-boundary fixtures (`fixture:*`):** `fixture:usage-site` is served locally by `scripts/verify/server.ts` over real HTTP (`/__fixture__/*`); platform targets (`fixture:youtube-*`, `fixture:twitch-*`, `fixture:kick-*`, `fixture:google-drive`) install Playwright `context.route(...)` handlers so 100% of TubeSize's real built MV3 content scripts, background service worker parsers, IndexedDB writers, badge updater, quality menu injector, toaster, and popup execute offline without bot checks or external network flakiness. Routes are removed again on the next live (`http`/`https`) `goto`, so a later live-site check never receives fixture HTML.
- **Isolation:** Uses an ephemeral profile and ephemeral localhost ports (`127.0.0.1:0`), never touching the user's personal browser. One active session runs at a time; calling `start` again cleanly stops any prior session first.

## Doctor & Smoke

Run `doctor` first whenever starting a verification session or whenever anything looks off:

```bash
bun run verify doctor
```

`doctor` is read-only and checks:

1. `bun` runtime version.
2. `chromium` executable path.
3. `.output/chrome-mv3/manifest.json` presence and freshness (warns if `src/` is newer than the build).
4. Fresh MV3 boot: launches isolated Chromium, confirms `background.js` comes online, opens `popup.html#/`, asserts zero `pageerror`, `console.error`, service-worker uncaught exceptions / `console.error`, extension `requestfailed`, or React error boundary, then tears down cleanly.

Run `smoke` for a fast automated end-to-end check across TubeSize's core runtime flows (also enforced in CI):

```bash
bun run verify smoke [--build] [--timeout <ms>] [--json]
```

`smoke` launches a single isolated Chromium session against the built `.output/chrome-mv3` extension and offline fixtures, auditing runtime issues after each of 5 deterministic flows:

1. `usage-tracking` — dual-path byte accounting (`webRequest` fixed `Content-Length`, chunked `fetch`/`XHR`/`blob:` `Worker`, `HEAD` exclusion) + toolbar badge (`"570K"`).
2. `youtube-vod` — in-page usage warning toaster trigger & `OK` dismissal, `.ytp-quality-menu` size badge injection (skipping `Auto` and `1080p Premium`), and real toolbar popup estimation.
3. `twitch-and-kick-live` — real toolbar popup estimation across Twitch and Kick live streams (`1080p`/`720p`/`480p` SI rates).
4. `settings-and-rtl` — `advancedView` toggle + Arabic (`العربية`) RTL persistence across reload.
5. `dashboard-lifecycle` — 14-day seed, JSON export, Clear All Usage Data (confirm + badge reset), and JSON import restore.

Exit codes across all `verify` commands:

- `0` — Verified / passed.
- `1` — Failed (runtime error, error boundary, or failed action).
- `2` — **Inconclusive** (missing Chromium, missing `.output/chrome-mv3`, or no active session). Report `inconclusive` honestly; never fake confidence.

## Drive

Read [features/README.md](./features/README.md) first, then follow the matching feature recipe.

### Static & Unit Checks (from `package.json`)

```bash
bun run all
```

### Interactive Playwright Commands

```bash
bun run verify status                                         # Check active session URL, surface, dir, and error count
bun run verify goto <target>                                  # popup|settings|daily|sites|today|week|month|lifetime|date:*|platform:*|site:*|fixture:*|URL
bun run verify popup [open|close]                             # Open or close the real toolbar popup targeting the active tab
bun run verify snapshot [path.aria.txt] [--selector <css>] [--quiet]  # Print/save ARIA tree of active surface (popup or tab)
bun run verify click --role button --name "Settings"          # Also supports --label, --text, --selector, --exact, --nth <n>
bun run verify hover [locator]                                # Hover an element (tooltips, chart bars)
bun run verify fill --role textbox --name "Search" --value "Python"
bun run verify press ArrowRight --repeat 5                    # Press a key N times (default 1)
bun run verify wait [--ms <n>] [locator] [--gone]             # Wait N ms and/or wait for element visible (or hidden with --gone)
bun run verify upload <file> --role button --name "Import JSON"       # Trigger file chooser & upload local file
bun run verify download [out.json] --role button --name "Export To JSON" # Trigger download & save to disk
bun run verify reload                                         # Reload active surface and wait for UI settle
bun run verify seed <full|heavy|empty> [--lang en|ar]         # Re-seed IndexedDB (full=14d, heavy=90d, empty=0d) / language
bun run verify state [--json]                                 # URL, surface, badge, dir, IndexedDB, chrome.storage, errors
bun run verify perf <bundle|popup|dashboard|memory|all> [opts] # Measure bundle size (enforce caps with `perf bundle --check`), popup latency, dashboard load, and memory (--target, --runs, --cached, --seed, --check, --json, --save)
bun run verify screenshot .verify-evidence/<name>.png         # Capture 2x PNG proof of active surface (popup or tab)
```

### Fixture Targets

- **Usage tracking:** `fixture:usage-site`
- **YouTube:** `fixture:youtube-vod`, `fixture:youtube-shorts`, `fixture:youtube-live`, `fixture:youtube-home`
- **Twitch:** `fixture:twitch-live`, `fixture:twitch-live-ads`, `fixture:twitch-vod`, `fixture:twitch-directory`
- **Kick:** `fixture:kick-live`, `fixture:kick-vod`, `fixture:kick-vod-slug`, `fixture:kick-browse`
- **Subdomains:** `fixture:google-drive`

### Stable Handles in This Repo

- Popup header actions: `button "Settings"`, `button "Dashboard"`
- Popup Advanced View audio switch: `switch "Include audio in sizes"`
- Popup Changelog Notice dismiss button: `button "Dismiss"` (Arabic: `button "إغلاق"`, inside `<output>`)
- Settings language combobox: `combobox "Language"` (`#language-select`, options `English` / `العربية`)
- Settings usage alert: `switch "Enable video usage limit exceeded alert"`, `#toasterThreshold` slider (200–1000; target thumb with `--selector '[data-slot="slider-thumb"]'`)
- Settings advanced view: `switch "Enable advanced view"` (CSS fallback: `label[for="advancedViewToggle"] ~ [role="switch"]`)
- Dashboard chart tabs: `link "By Day"` (`a[href="#/daily"]`), `link "By Site"` (`a[href="#/sites"]`)
- Dashboard footer actions: `button "Clear All Usage Data"`, `button "Export To JSON"`, `button "Import JSON"`, dialog confirm `button "Continue"`, `button "Cancel"`
- In-page warning toaster: `#TubeSize-Toast-Host`, `button "OK"`, `button "Don't show again for today"`
- In-page YouTube quality menu badges: `.ytp-settings-menu`, `.tubesize-quality-menu-panel`

## Evidence

Save proof artifacts under `.verify-evidence/<feature-or-task>/` (gitignored and excluded from release zips):

- Capture **both the action and the resulting state** (not only the final screen).
- Include ARIA snapshots (`snapshot <path.aria.txt>`), 2× screenshots (`screenshot <path.png>`), and `state` output showing `Badge`, IndexedDB counts/bytes, `chrome.storage.sync` / `chrome.storage.local`, `dir` (`ltr`/`rtl`), and `Errors: 0`.
- For mutations (settings toggles, language switch, clear/import, toaster suppression, changelog dismissal), always run `reload` (or revisit) followed by `state` + `snapshot` to prove persistence.
- For layout or copy changes, verify both `--lang en` (`dir=ltr`) and `--lang ar` (`dir=rtl`).
- Keep live external sites (`youtube.com`, `twitch.tv`, `kick.com` over the public internet) separate from offline `fixture:*` proofs: `fixture:*` proves TubeSize's real extension logic against recorded/synthetic platform payloads; live-internet drift against upstream site HTML/API changes cannot be proven offline without live network access and must be noted honestly.

## Cleanup

Always stop the session when done:

```bash
bun run verify stop
```

`stop` closes the Playwright `BrowserContext` (and any attached popup/CDP connection), terminates **only** the recorded server PID (never `pkill chrome`), deletes `.verify-evidence/.session.json` and the ephemeral `/tmp/ts-verify-*` profile, and **preserves all screenshots and snapshots in `.verify-evidence/`**. Sessions also auto-exit after 20 minutes of inactivity.

## Helpers

- [scripts/verify.ts](../../../scripts/verify.ts) — CLI entrypoint (`bun run verify --help`).
- [scripts/verify/browser.ts](../../../scripts/verify/browser.ts) — Chromium discovery, isolated Playwright MV3 launcher with CDP port support, route resolution, settle & DOM audit helpers.
- [scripts/verify/fixtures.ts](../../../scripts/verify/fixtures.ts) — Local HTTP `/__fixture__/*` handler and Playwright `context.route(...)` platform network-boundary fixtures.
- [scripts/verify/perf.ts](../../../scripts/verify/perf.ts) — Performance benchmarks for bundle size, uncached/cached popup size-estimation latency, cold Dashboard load latency, and extension memory/storage footprint.
- [scripts/verify/seed.ts](../../../scripts/verify/seed.ts) — Deterministic 14-day (`full`) and 90-day (`heavy`) SI-unit IndexedDB seeder (compatible with Dexie `version(1)` / IndexedDB `10+`) and `inspectDb` via the MV3 service worker.
- [scripts/verify/server.ts](../../../scripts/verify/server.ts) — Detached localhost HTTP server keeping the Playwright session warm between CLI commands and attaching to toolbar popups via `chrome.action.openPopup()`.
- [scripts/verify/smoke.ts](../../../scripts/verify/smoke.ts) — Automated single-session end-to-end smoke suite (`bun run verify smoke`) covering usage tracking, YouTube toaster/quality menu/popup, Twitch & Kick live popups, Settings + Arabic RTL persistence, and Dashboard export/clear/import.
