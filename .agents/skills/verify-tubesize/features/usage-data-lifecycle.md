# Usage data lifecycle

Usage data lifecycle lets a user start from an empty database, accumulate and view recorded site/video usage, clear all stored IndexedDB usage data with confirmation, export usage to a validated JSON file, and import a JSON backup back into IndexedDB.

## Sub-features

- `data-empty-to-seeded` transitions cleanly between zero records (`NoUsageData`) and populated IndexedDB tables (`siteUsage`, `watchHistory`, `videoMetaData`).
- `data-clear-all` wipes all three IndexedDB stores via the `Clear All Usage Data` confirmation dialog and invalidates dashboard queries.
- `data-export-json` filters valid usage entries and downloads `tubesize-YYYY-MM-DD.json` (or shows an error alert when there is no usage to export).
- `data-import-json` validates uploaded JSON against `ImportSchema` (`src/lib/zodSchema.ts`), replaces `siteUsage` in IndexedDB (after confirmation when existing data is present), and refreshes the dashboard.

## How to get to it (user POV)

- Open the Dashboard (`dashboard.html#/daily` or `#/sites`) and use the footer buttons: `Clear All Usage Data`, `Export To JSON`, and `Import JSON`.

## Driving it with bun run verify

Preconditions:

- `bun run verify doctor` exits `0` with a fresh `.output/chrome-mv3` build.

- **Start with populated data.** Run `bun run verify start --target daily --seed full`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/lifecycle/1-populated.png`. Observable result: `DB: 14 days, 6 videos`, `Errors: 0`.
- **Clear All Usage Data via real confirmation dialog.** Run `bun run verify click --role button --name "Clear All Usage Data"`, inspect the dialog with `bun run verify snapshot`, confirm with `bun run verify click --role button --name "Continue"`, then run `bun run verify state` and `bun run verify screenshot .verify-evidence/lifecycle/2-cleared.png`. Observable result: `DB: 0 days, 0 videos`, `Errors: 0`, and `NoUsageData` renders.
- **Confirm empty state persists after reload.** Run `bun run verify reload` and `bun run verify state`. Observable result: `DB: 0 days` and `Errors: 0`.
- **Verify empty-export error handling.** While empty, run `bun run verify click --role button --name "Export To JSON"` and `bun run verify snapshot`. Observable result: destructive alert appears informing the user there is no usage to export, with `Errors: 0`.
- **Re-seed and confirm populated recovery.** Run `bun run verify seed full`, `bun run verify state`, and `bun run verify screenshot .verify-evidence/lifecycle/3-reseeded.png`. Observable result: `DB: 14 days` and charts reappear.
- **Teardown.** Run `bun run verify stop`.

## Gotchas

- `Clear All Usage Data` and non-empty `Import JSON` both open an `AlertDialogBasic` confirmation modal; clicking the footer button alone does not mutate IndexedDB until `button "Continue"` (or `متابعة` in Arabic) is clicked.
- `Import JSON` opens a dynamic `<input type="file" accept=".json">` file chooser, and `Export To JSON` triggers a blob download; if modifying `exportToJsonBtn.tsx` or `importJson.tsx`, prove file download/upload directly via Playwright `waitForEvent("download")` / `waitForEvent("filechooser")` (and `bun run test`) rather than claiming those sub-features verified from `Clear All` alone.
