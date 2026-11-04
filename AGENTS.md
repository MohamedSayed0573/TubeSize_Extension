# AGENTS.md

## Environment

- WSL2. Windows files are under `/mnt/c`; this repo lives in the Linux filesystem.
- No Linux Chrome/Chromium is installed on `PATH`. Do not search for one.
- Browser automation uses Playwright's bundled Chromium:
  `~/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`
  (Chrome for Testing 153.0.8010.12). It is a standalone binary; run it directly.
- `playwright` is not a global command. The only CLI is local:
  `./node_modules/.bin/playwright-core --version` (1.63.0). `playwright-core` is a
  library and does not download browsers; the cache above is shared user-wide.
- Real Chrome is Windows-only: `/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`.
  WSL cannot launch it or drive it.
- The Linux Chrome profile (`~/.config/google-chrome`) is **not signed in** to Google
  or YouTube (only `NID`). Do not dig through browser profiles or try to decrypt cookies.
- Use `/tmp/opencode` for scratch files and throwaway scripts.

## Auth-gated data

If a task needs a signed-in site (e.g. a YouTube Premium format), stop and ask the user
to either save the page HTML/JSON (Desktop is `C:\Users\mohammed\Desktop`, visible at
`/mnt/c/Users/mohammed/Desktop`) or export cookies. Logged-out fetches silently omit
Premium-only data, which looks like "the format does not exist" but is not.

## YouTube debugging

- `devTest/youtube/` is gitignored scratch.
- `devTest/youtube/ytInialPlayerResponse/getYtInitialPlayerResponse.mjs <url>` fetches the
  watch page and **overwrites** `ytInitialPlayerResponse.json` next to it. Copy anything
  worth keeping into `src/tests/assets/` first or after.
- Inspect responses with `jq`, e.g.
  `jq '.streamingData.adaptiveFormats[] | select(.itag == 399)' ytInitialPlayerResponse.json`.
- Premium 1080p AV1 is itag `721` and only appears in a Premium session's player response.
  Standard AV1 1080p is `399`.

## Commands

- Tests: `bun test --isolate`
- Types: `bun check`
- Lint: `bun lint .`
- Format check: `bun fmt --check`; write with `bun fmt . --write`
- Build: `bun run build` (Chrome MV3, WXT)
