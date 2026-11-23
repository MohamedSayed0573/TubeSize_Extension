# Usage data lifecycle

Usage data lifecycle lets a user start from an empty database, accumulate and view recorded site/video usage, cancel or confirm clearing all IndexedDB data, export valid usage to a JSON file (with empty-state error feedback), and import a validated JSON backup into either an empty or populated database.

## Sub-features

- `data-empty-to-seeded` transitions cleanly between zero records (`No usage data available.`) and populated IndexedDB tables (`siteUsage`, `watchHistory`, `videoMetaData`).
- `data-clear-cancel` opens the `Clear All Usage Data` confirmation dialog and leaves all IndexedDB tables intact on `Cancel`.
- `data-clear-all` wipes all three IndexedDB stores via `Clear All Usage Data` → `Continue` and invalidates dashboard queries.
- `data-export-json` filters valid usage entries and downloads `tubesize-YYYY-MM-DD.json` (or displays `Nothing to export — start browsing to collect usage` when empty).
- `data-import-json` validates uploaded JSON against `ImportSchema` (`src/lib/zodSchema.ts`) and loads `siteUsage` directly into IndexedDB when the DB is empty.
- `data-import-replace-nonempty` requires confirming `Are you absolutely sure?` (`Continue`) before replacing existing `siteUsage` data on non-empty DB imports.
- `data-import-invalid-json` surfaces a destructive alert on malformed JSON or schema violations without wiping existing data.

## How to get to it (user POV)

- Open the Dashboard (`dashboard.html#/daily` or `#/sites`) and use the footer buttons: `Clear All Usage Data`, `Export To JSON`, and `Import JSON`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Start with populated data and verify Clear cancel preserves data.** Run `bun run verify start --target daily --seed full`, `bun run verify state`, `bun run verify screenshot .verify-evidence/lifecycle/1-populated.png`, `bun run verify click --role button --name "Clear All Usage Data"`, `bun run verify click --role button --name "Cancel"`, and `bun run verify state`. Observable result: `DB: 14 days, 6 videos` stays unchanged after cancelling (`Errors: 0`).
- **Export populated usage to JSON.** Run `bun run verify download .verify-evidence/lifecycle/export.json --role button --name "Export To JSON"`. Observable result: saves `tubesize-YYYY-MM-DD.json` to `.verify-evidence/lifecycle/export.json` with non-zero bytes and `newErrors=0`.
- **Verify invalid JSON import error on populated DB.** Create a temporary invalid JSON file (`echo '{"bad":true}' > .verify-evidence/lifecycle/invalid.json`), run `bun run verify click --role button --name "Import JSON"`, `bun run verify upload .verify-evidence/lifecycle/invalid.json --role button --name "Continue" || true`, `bun run verify snapshot`, and `bun run verify state`. Observable result: `ImportJson` rejects invalid schema input with a destructive UI alert (`Alert`), existing `DB: 14 days` remains intact, and `Errors: 1` reflects the single expected `console.error` logged by `importJson`'s catch handler.
- **Clear All Usage Data via real confirmation dialog.** Run `bun run verify click --role button --name "Clear All Usage Data"`, inspect the dialog with `bun run verify snapshot`, confirm with `bun run verify click --role button --name "Continue"`, then run `bun run verify state` and `bun run verify screenshot .verify-evidence/lifecycle/2-cleared.png`. Observable result: `DB: 0 days, 0 videos`, `Errors: 0`, and `No usage data available.` renders.
- **Confirm empty state persists after reload and verify empty-export error.** Run `bun run verify reload`, `bun run verify state`, `bun run verify click --role button --name "Export To JSON"`, and `bun run verify snapshot`. Observable result: `DB: 0 days` persists across reload and destructive alert displays `Nothing to export — start browsing to collect usage` (`Errors: 0`).
- **Import valid exported JSON back into empty DB and verify non-empty replacement dialog.** Run `bun run verify upload .verify-evidence/lifecycle/export.json --role button --name "Import JSON"`, `bun run verify reload`, `bun run verify state`, then test non-empty replacement via `bun run verify click --role button --name "Import JSON"` followed by `bun run verify upload .verify-evidence/lifecycle/export.json --role button --name "Continue"`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/lifecycle/3-restored.png`. Observable result: `DB: 14 days` restores cleanly and persists across reload (`Errors: 0`).
- **Re-seed full DB (including watchHistory & videoMetaData).** Run `bun run verify seed full`, `bun run verify state`. Observable result: `DB: 14 days, 6 videos` restored (`Errors: 0`).
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `Clear All Usage Data` and non-empty `Import JSON` both open an `AlertDialogBasic` confirmation modal; clicking the footer button alone does not mutate IndexedDB until `button "Continue"` (or `متابعة` in Arabic) is clicked.
- When importing into a **non-empty** DB, click `button "Import JSON"` first to open the confirmation modal, then run `bun run verify upload <file> --role button --name "Continue"` (the file chooser opens when `Continue` is clicked). When the DB is **empty**, clicking `Import JSON` opens the file chooser directly.
- JSON export/import covers `siteUsage` only — `watchHistory` and `videoMetaData` are not part of the exported JSON schema, so after clearing and importing you must run `seed full` if you also need seeded video tables.
- Invalid JSON uploads intentionally log `console.error(err)` in `src/pages/dashboard/overview/importJson.tsx` before showing the destructive alert, causing `bun run verify upload` to report `newErrors=1` (`exit 1`); run this negative test after positive `Errors: 0` proofs or start a fresh session afterward.
