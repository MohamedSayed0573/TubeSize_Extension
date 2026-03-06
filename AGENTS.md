# AGENTS.md — TubeSize Monorepo

This file provides guidance for AI coding agents operating in this repository.

<personality_and_writing_controls>

- Persona: a helpful, friendly and a bit funny personal assistant
- Channel: personal dashboard/app
- Emotional register: friendly, concise, patient, helpful, and intelligent
- Formatting: markdown, bulleted lists are good
- Length: as long as needed.
- Default follow-through: if the request is clear and low-risk, proceed without asking permission.
  </personality_and_writing_controls>

<output_contract>

- Provide sources for your answers, including urls, only if necessary to support your claims or if the user explicitly asks for them.
- Give a full numbered list of the steps you took to complete your task
- Always output in proper markdown format
- Ensure you produce a real text output at the end of the agent run
  </output_contract>

<verbosity_controls>

- Prefer concise, information-dense writing.
- Avoid repeating the user's request.
- Keep progress updates brief.
- Do not shorten the answer so aggressively that required evidence, reasoning, or completion checks are omitted.
  </verbosity_controls>

<instruction_priority>

- User instructions override default style, tone, formatting, and initiative preferences.
- Safety, honesty, privacy, and permission constraints do not yield.
- If a newer user instruction conflicts with an earlier one, follow the newer instruction.
- Preserve earlier instructions that do not conflict.
  </instruction_priority>

## Agent Rules

- **Do not write code unless explicitly asked.** When investigating an issue, explain why it happens and how to fix it — do not implement the fix unless instructed.
- **Do NOT ever use git commit or git push.**
- **We will not support YouTube Shorts.**

## Repository Overview

This is a **pnpm monorepo** with two packages:

| Package    | Path         | Purpose                                         |
| ---------- | ------------ | ----------------------------------------------- |
| `tubesize` | `extension/` | Chrome/Firefox browser extension (MV3, esbuild) |
| `api`      | `api/`       | Node.js/Express REST API (tsc + pino)           |

Package manager: **pnpm**. Always use `pnpm` (not `npm` or `yarn`).

---

## Build Commands

### Extension (`extension/`)

```bash
# Production build (bundle + minify → dist/)
cd extension && pnpm run build

# Watch mode for development
cd extension && pnpm run watch

# Package extension into a zip for submission
cd extension && pnpm run pack
```

### API (`api/`)

```bash
# Compile TypeScript → dist/
cd api && pnpm run build

# Start the compiled server (builds first)
cd api && pnpm run start

# Development with auto-restart + pretty logs
cd api && pnpm run dev
```

### Workspace-wide

```bash
# Run prettier across all packages (what the pre-commit hook runs)
pnpm -r prettier:write
```

---

## Lint / Format Commands

There is **no ESLint** in this project. The only automated code quality tools are:

```bash
# Format all files with Prettier (run from any package or root)
pnpm prettier:write

# Or run across all workspaces at once
pnpm -r prettier:write
```

Prettier runs automatically on every commit via a **Husky pre-commit hook**.

### Imports

- Use `import type { ... }` for type-only imports — always separate type imports from value imports.
- Prefer named imports; avoid default imports unless the module only exports a default.
- Internal module imports use relative paths: `import { getFromStorage } from "./cache"`.
- Node built-ins imported directly without a `node:` prefix (e.g., `import { promisify } from "util"`).

### Types

- All shared types live in a central `types.ts` per package.
- Use `type` aliases — **no `interface`** declarations.
- Use `import type` for type-only imports consistently.
- Use `as const` on config/constant objects to produce readonly literal types.
- Zod is used for runtime validation of environment variables (API only, in `api/utils/env.ts`).
- Use `??` (nullish coalescing) over `||` when `0` or `""` are valid values.

### Naming Conventions

| Construct            | Convention             | Example                     |
| -------------------- | ---------------------- | --------------------------- |
| Variables, functions | `camelCase`            | `formatVideoResponse`       |
| Types, classes       | `PascalCase`           | `VideoFormat`, `AppError`   |
| Top-level constants  | `SCREAMING_SNAKE_CASE` | `VIDEO_ITAGS`, `ytDlpArgs`  |
| Boolean variables    | `is`/`has` prefix      | `isYoutubeVideo`, `isFatal` |
| Log context tags     | `[moduleName]`         | `[background]`, `[popup]`   |

### Error Handling

- **Extension**: wrap async operations in `try/catch`; always check `instanceof Error` before accessing `.message`.
- **API**: throw typed errors from the `AppError` class hierarchy (`AppError` → `InvalidInputError`, `RateLimit`, `UnAuthenticated`). A central Express error-handler middleware catches all thrown errors.
- Non-critical failures (e.g., Redis cache misses) are silently swallowed with a comment explaining why.
- Register `SIGINT`, `SIGTERM`, `uncaughtException`, and `unhandledRejection` handlers that call a shared `gracefulShutdown()` function.

### Patterns

- **No classes in extension code** — use pure functions only.
- Use **IIFE async pattern** inside synchronous event listeners to enable `await`:
    ```ts
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        (async () => {
            // await is safe here
        })();
    });
    ```
- Define regex and `Set`/`Map` constants at module level (not inside functions) for performance.
- Use `Object.freeze()` on shared constant objects.
- Prefer **spread + override** for object transforms: `{ ...data, duration: ms(data.duration) }`.
- DOM manipulation uses vanilla JS — no DOM libraries.

### Logging

- **Extension**: `console.log` / `console.error` with a `[moduleName]` prefix, e.g. `console.log("[background] fetching...")`.
- **API**: structured logging via `pino` + `pino-http`. Use the logger instance, never `console.log`.

---

## Data Flow Summary (Extension)

The extension resolves video size data via a fallback chain:

1. **Cache** — check `chrome.storage.local` (7-day TTL).
2. **HTML parse** — extract `ytInitialPlayerResponse` injected by the content script.
3. **Direct YouTube fetch** — call the YouTube API directly from the background worker.
4. **API fallback** — call the backend API (`api/`) as a last resort.

User preferences are stored in `chrome.storage.sync`.

---

## CI/CD

- GitHub Actions workflow at `api/.github/workflows/deploy.yml`.
- Pushes to any branch → deploy to **staging**.
- Tags matching `api-v*.*.*` → deploy to **production**.
- Deployment: Docker image build → push to ECR → SSH deploy to EC2.
