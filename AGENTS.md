# TubeSize Agent Instructions

## Domain Glossary

Canonical domain terms live in [`GLOSSARY.md`](./GLOSSARY.md). Do not inline it into prompts—read it on demand.

**Read `GLOSSARY.md` before:**

- Designing or planning features/refactors (`/architect`, `/arena`, `/poteto-mode` Feature / Refactoring / Multi-phase plan)
- Adding or changing types, storage keys, IndexedDB tables, messaging payloads, adapters, or domain helpers (`src/types/`, `src/db.ts`, `src/messaging.ts`, `src/adapters/`, `src/lib/storage.ts`, `src/lib/domain.ts`)
- Reviewing diffs or checking blast radius (`/interrogate`, `/blast-radius`) for semantic mismatches (e.g., `origin` vs. `siteKey`, nominal `resolution` vs. `videoHeight`, decimal SI vs. binary IEC units)
- Writing user-facing docs, PR descriptions, or new i18n copy

**Skip reading `GLOSSARY.md` for:**

- Isolated styling, mechanical formatting/linting, dependency bumps, or localized edits where the surrounding types are already unambiguous.

When a change introduces, renames, or retires a domain concept, update `GLOSSARY.md` in the same PR.

## Non-Obvious Invariants

- **Single check command:** Run `bun run all` (`tsc`, `lint --max-warnings=0`, `prettier:check`, `knip`, `test`, `build`, `build:firefox`) before opening or updating a PR.
- **`MAIN` vs `ISOLATED` content worlds:** `src/entrypoints/genericObserver.content.ts` runs in the page `MAIN` world (no `chrome.*`, checked by `tsconfig.mainWorld.json`) and posts `SITE_USAGE` / `WATCH_HISTORY` messages to `src/entrypoints/usageBridge.content.ts` in the `ISOLATED` world, which validates and forwards them to the background.
- **`Content-Length` deduplication:** `src/entrypoints/background/usageTracker.ts` (`webRequest.onCompleted`) counts only responses with a positive `Content-Length` header; `genericObserver.content.ts` counts only responses missing a usable `Content-Length` header so neither double-counts bytes.
- **Firefox MV3 differences:** `wxt.config.ts` omits the Chromium-only `favicon` permission and sets `browser_specific_settings.gecko` (`strict_min_version: "121.0"`). Runtime code branches on `isFirefox()` (`src/lib/browser.ts`) to omit `extraHeaders` in `webRequest`, fall back from `/_favicon/` to `originFaviconURL`, and read `originUrl`/`documentUrl` where `initiator` is absent.

## Runtime Verification

For UI, settings, dashboard, routing, i18n/RTL, storage, or IndexedDB changes, follow [`.agents/skills/verify-tubesize/SKILL.md`](./.agents/skills/verify-tubesize/SKILL.md).
