---
name: check-todos
description: "Audit condition-gated TODO and FIXME comments in TubeSize (such as waiting on a Bun stable release or browser API), verify each trigger with live evidence, and resolve ready items with full static and build checks. Use for periodic TODO sweeps or checking whether waiting workarounds can be removed."
---

# Check TODOs

Audit condition-gated `TODO` and `FIXME` comments in this repo, check whether their trigger conditions are now met, and resolve only the ones proven ready.

## 1. Scan and classify

Search the codebase for TODOs:

```bash
grep -rnE "TODO|FIXME" src scripts .github package.json wxt.config.ts
```

Split results into two buckets:

- **Condition-gated:** names an external trigger such as a runtime release, dependency fix, or browser API (for example, `once Bun ships lint and fmt in stable`). Group related TODOs that share the same trigger into one unit.
- **Backlog:** feature ideas or open-ended improvements with no external trigger (for example, `Add support for premium formats`). Do not implement backlog TODOs.

## 2. Verify each trigger with live evidence

Never judge a trigger from memory. Check the authoritative source:

- **Tool or runtime releases (e.g. Bun):** check the latest stable release notes on GitHub (`oven-sh/bun` releases) and confirm the exact capability (`bun lint` and `bun fmt` shipping in stable, not only a new version number).
- **Browser or WebExtension APIs:** check MDN / Chrome / Firefox release notes for the minimum versions supported in [wxt.config.ts](../../../wxt.config.ts).
- If the trigger is **not met** or cannot be confirmed, make zero file edits and record the evidence.

## 3. Resolve ready trigger groups

For each trigger confirmed met:

1. Update every file in the trigger group in one cohesive edit and delete the resolved `TODO` comments.
2. For the Bun stable `lint` / `fmt` group:
    - Update `packageManager` in [package.json](../../../package.json) to the new stable Bun version.
    - Remove `bun-version: canary` in [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) and [.github/workflows/release.yml](../../../.github/workflows/release.yml) so `oven-sh/setup-bun` reads `package.json`.
    - Update [scripts/checkBun.ts](../../../scripts/checkBun.ts) to drop the canary requirement and switch upgrade hints to `bun upgrade`.
3. Do not touch unrelated files or backlog TODOs.

## 4. Verify changes

Skip this step if no files changed. Otherwise run:

```bash
bun run tsc && bun run lint --max-warnings=0 && bun run knip && bun run test && bun run build && bun run build:firefox
```

If a resolved TODO changes UI, storage, routing, or IndexedDB behavior, also run [.agents/skills/verify-tubesize/SKILL.md](../verify-tubesize/SKILL.md).

## 5. Report

Return a compact status table with columns: `Trigger`, `Status` (`Resolved`, `Waiting`, `Inconclusive`, or `Skipped (backlog)`), `Files`, and `Evidence`. If nothing was ready, state that zero files changed.
