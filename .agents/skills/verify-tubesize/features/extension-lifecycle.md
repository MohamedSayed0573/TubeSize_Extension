# Extension lifecycle & Firefox parity

Extension lifecycle & Firefox parity ensures install and update events clear stale `local:<platform>:` media caches without wiping settings or IndexedDB, runs update storage migrations safely, and produces a valid Firefox Manifest V3 bundle without Chromium-only permissions.

## Sub-features

- `lifecycle-cache-cleanup` clears only `local:youtube:*`, `local:twitch:*`, and `local:kick:*` media cache keys on `install` and `update`, preserving `sync:*` settings, `local:lastSeenVersion`, `local:codecSupport`, `local:toasterSuppressedDate`, and IndexedDB.
- `lifecycle-migrations` removes legacy keys (such as `sync:qualityIds`) safely inside per-migration `try/catch` blocks on every extension `update` (runs unconditionally; `last_version` is metadata only).
- `lifecycle-firefox-build` strips Chromium-only `"favicon"` permission, emits `background.scripts: ["background.js"]` and `browser_specific_settings.gecko` in `.output/firefox-mv3/manifest.json`, avoids `"extraHeaders"` in `webRequest` listeners, reads `originUrl`/`documentUrl` where `initiator` is absent (filtering `moz-extension://`), and falls back to direct origin `/favicon.ico` only in popup `SiteIcon`.

## How to get to it (user POV)

- Install or update TubeSize in Chrome/Edge or Firefox (`bun run build` and `bun run build:firefox`), open the popup/dashboard, and confirm existing usage history and settings stay intact while platform media caches refresh.

## Driving it with bun run verify

Preconditions:

- Clean workspace dependencies installed (`bun install`).

- **Build both Chrome MV3 and Firefox MV3 targets.** Run `bun run build && bun run build:firefox`. Observable result: both `.output/chrome-mv3/manifest.json` and `.output/firefox-mv3/manifest.json` emit with exit code `0`.
- **Inspect Firefox MV3 manifest parity.** Run `bun -e 'const m=await Bun.file(".output/firefox-mv3/manifest.json").json(); console.log({ mv: m.manifest_version, permissions: m.permissions, host: m.host_permissions, background: m.background, gecko: m.browser_specific_settings?.gecko, scripts: m.content_scripts?.map(s => ({ world: s.world, run_at: s.run_at })) })'`. Observable result: `mv: 3`, `permissions` equals `["activeTab", "storage", "webRequest"]` (no `"favicon"`), `host_permissions` includes `"<all_urls>"`, `background` has `scripts: ["background.js"]`, `gecko.id` is `"tubesize@mohammedsayed.dev"`, `strict_min_version` is `"121.0"`, and `data_collection_permissions.required` is `["none"]`.
- **Verify Chrome MV3 clean boot and post-boot state persistence.** Run `bun run verify doctor`, `bun run verify start --target popup --seed full --prev-version 3.0.0`, and `bun run verify state`. Observable result: `doctor` exits `0`, `Local:` shows `"lastSeenVersion":"3.0.0"` and `"mediaCacheKeys":[]`, `DB: 14 days, 6 videos` is populated, and `Errors: 0`.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- Playwright (`launchPersistentContext` `--load-extension`) drives Chromium MV3 only; Firefox MV3 runtime execution is not driven in headless Chromium and relies on `bun run build:firefox`, `isFirefox()` compile-time branching (`src/lib/browser.ts` via `import.meta.env.FIREFOX`), and manifest verification.
- On `chrome.runtime.onInstalled`, Playwright freshly installed profiles fire `reason: "install"` at launch before `scripts/verify/server.ts` writes `--prev-version` or seeds IndexedDB; `clearMediaCache` and `runMigrations` update logic is verified statically alongside `src/entrypoints/background/installCleanup.ts` and `src/entrypoints/background/migrations.ts`.
