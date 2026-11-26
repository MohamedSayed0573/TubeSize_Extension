# TubeSize Agent Instructions

## Domain Glossary

Canonical domain terms live in [`GLOSSARY.md`](./GLOSSARY.md). Do not inline it into prompts—read it on demand.

**Read `GLOSSARY.md` before:**

- Designing or planning features/refactors (`/architect`, `/arena`, `/poteto-mode` Feature / Refactoring / Multi-phase plan)
- Adding or changing types, storage keys, IndexedDB tables, messaging payloads, estimators, or domain helpers (`src/types/`, `src/db.ts`, `src/messaging.ts`, `src/entrypoints/background/estimateMedia.ts`, `src/lib/mediaEstimate.ts`, `src/lib/settings.ts`, `src/lib/mediaCache.ts`, `src/lib/domain.ts`)
- Reviewing diffs or checking blast radius (`/interrogate`, `/blast-radius`) for semantic mismatches (e.g., `origin` vs. `siteKey`, nominal `resolution` vs. `videoHeight`, decimal SI vs. binary IEC units)
- Writing user-facing docs, PR descriptions, or new i18n copy

**Skip reading `GLOSSARY.md` for:**

- Isolated styling, mechanical formatting/linting, dependency bumps, or localized edits where the surrounding types are already unambiguous.

When a change introduces, renames, or retires a domain concept, update `GLOSSARY.md` in the same PR.

## Non-Obvious Invariants

- **Single check command:** Run `bun run all` (`tsc`, `lint --max-warnings=0`, `prettier:check`, `knip`, `test`, `build`, `build:firefox`, `verify perf bundle --check`) before opening or updating a PR.
- **Lightweight vanilla-DOM content scripts & strict budgets:** Everything injected into user pages (`src/entrypoints/content/**`, `src/entrypoints/genericObserver.content.ts`, `src/entrypoints/usageBridge.content.ts`) must stay minimal and vanilla DOM — no React/JSX, UI libraries (`lucide-react`, `@base-ui/react`, Tailwind), `db`/parsers, or global side-effect `.css` imports (use `?inline` inside Shadow DOM, and offload heavy work to `background` via `@/messaging`). Enforced by `.oxlintrc.json` and `scripts/verify/perf.ts` (`BUNDLE_BUDGETS` inspects `manifest.json` `content_scripts` assets, caps their combined size and per-file sizes, and rejects unbudgeted injected JS/CSS). Never raise `BUNDLE_BUDGETS`, add new `*.content.ts` entrypoints, or relax `.oxlintrc.json` content-script rules without explicit user approval.
- **`MAIN` vs `ISOLATED` content worlds & tsconfig scopes:** `src/entrypoints/genericObserver.content.ts` mounts `src/lib/pageUsageObserver.ts` in the page `MAIN` world (no `chrome.*`, zero platform URL imports, checked by `tsconfig.mainWorld.json`) and dispatches bytes-only, synchronous `TUBESIZE_SITE_USAGE` window `CustomEvent`s to `src/entrypoints/usageBridge.content.ts` in the `ISOLATED` world, which validates and forwards them via `addUsage` to the background (where `src/entrypoints/background/usageIngestion.ts` derives `Origin`, `WatchHistory`, and single-flight `VideoMetadata` solely from trusted `sender.tab.url` and `sender.url`). Browser extension code is checked by `tsconfig.app.json` (`vite/client` and `chrome` only, blocking `bun` globals), while `.oxlintrc.json` enforces `no-restricted-globals` and `no-restricted-imports` against Node/Bun APIs in `src/` (since `wxt`/`vite` types transitively reference `@types/node`), and `tsconfig.scripts.json` scopes `scripts/`, `src/tests/`, and `wxt.config.ts`.
- **`Content-Length` deduplication:** `src/entrypoints/background/usageTracker.ts` (`webRequest.onCompleted`) counts only responses with a finite positive `Content-Length` header; `src/lib/pageUsageObserver.ts` (`hasPositiveContentLength`) counts only responses missing a finite positive `Content-Length` header across `fetch`, `XMLHttpRequest`, and re-hosted classic `blob:` `Worker`s so neither double-counts bytes.
- **Firefox MV3 differences:** `wxt.config.ts` omits the Chromium-only `favicon` permission and sets `browser_specific_settings.gecko` (`strict_min_version: "128.0"`). Runtime code branches on `isFirefox()` (`src/lib/browser.ts`) to omit `extraHeaders` in `webRequest`, fall back from `/_favicon/` to `originFaviconURL`, and read `originUrl`/`documentUrl` where `initiator` is absent.

## Runtime Verification

For UI, settings, dashboard, routing, i18n/RTL, storage, or IndexedDB changes, follow [`.agents/skills/verify-tubesize/SKILL.md`](./.agents/skills/verify-tubesize/SKILL.md).
