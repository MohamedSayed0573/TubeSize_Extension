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

## Runtime Verification

For UI, settings, dashboard, routing, i18n/RTL, storage, or IndexedDB changes, follow [`.agents/skills/verify-tubesize/SKILL.md`](./.agents/skills/verify-tubesize/SKILL.md).
