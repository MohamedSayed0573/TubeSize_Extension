# ACP web searches are recorded as file searches

**Status:** open — still present on `upstream/main` at `135c78a278` (2026-11-23)
**First seen:** 2026-11-23, T3 Code fork at `~/.t3/projects/t3code` (branch `fix/antigravity-usage-limits-stale-token`, commit `8fdcaae970`)
**Provider:** Antigravity (`antigravity` runtime 1.4.5, model `gemini-4-neon`)

## What happens

When an Antigravity agent calls its `search_web` tool, T3 stores the call as a `file_search` item:

| | Harness (actual call) | T3 (recorded item) |
|---|---|---|
| Tool | `search_web` | item type `file_search` |
| Arguments | `{"query":"…"}`, `{"domain":"x.com","query":"…"}` | `{"pattern":"…"}` |
| Title | `Searched` (render info `search: web`) | `Searched "…"` |

The tool name is dropped entirely, and the web query is re-typed as a file-search pattern. Because `formatSearchToolLabel` happens to render `Searched <query>` for a `query` argument, the result reads plausibly and the substitution is invisible in the transcript.

## Where it happened

Thread: [Evaluating Headless Browser CLI](t3-thread://v2/457f0e20-8bed-4806-a18b-6f1706c056c4/c4605f41-bf58-4303-80e9-dbc723e51b9f) (`c4605f41-bf58-4303-80e9-dbc723e51b9f`)

Three web searches in that thread's first turn, all recorded as file searches:

| Activity position | Time (UTC+02:00) | Real call | Recorded as |
|---|---|---|---|
| 3 | 08:17:15 | `search_web` `{"query":"\"2094457600259842065\" OR \"poteto\" verification CLI headless browser agent"}` | `file_search`, title `Searched "2094457600259842065" OR "poteto" verification CLI headless browser agent` |
| 7 | 08:18:24 | `search_web` `{"domain":"x.com","query":"poteto status 2094457600259842065"}` | `file_search`, title `Searched poteto status 2094457600259842065` |
| 8 | 08:18:24 | `search_web` `{"query":"\"poteto\" \"verification\" \"CLI\" OR \"headless\" OR \"playwright\" agentic coding"}` | `file_search`, title `Searched "poteto" "verification" "CLI" OR "headless" OR "playwright" agentic coding` |

Raw sources for the same three steps:

- Harness side: `~/.t3/userdata/providers/antigravity/ac0a3dfd6dddb20962cecff6ee5fe65e19d3923be20e52c5ab52ff877f7e4c32/antigravity-acp/conversations/356fd0a3-21c7-4c82-80f1-c312bd566eac.db`, table `steps`, rows 2, 6 and 7 — tool name `search_web` with `query`/`domain` arguments.
- T3 side: the thread above, activity items at positions 3, 7 and 8 — item type `file_search` with `pattern`.

## Why it is wrong

- The transcript cannot distinguish a web search from a local `grep_search`. Both render as `Searched …`.
- A web query is stored as a file path/pattern (`pattern = query`), so the item claims a file search that never happened.
- Any review of what the agent actually did — e.g. "did it read the link, or did it search for the topic instead?" — is unanswerable from the recorded item.
- The real tool name is unrecoverable after the fact without reading the provider's own conversation store.

## Where the classification is decided

- [adapter.ts:4802](/home/mohammed/.t3/projects/t3code/packages/provider-acp/src/server/adapter.ts:4802) — `case "search"` for ACP `kind: "search"`.
- [adapter.ts:1466](/home/mohammed/.t3/projects/t3code/packages/provider-acp/src/server/adapter.ts:1466) — `acpBackendWebSearch` recognises a web search only from `rawInput.variant`, `rawOutput.action.type === "search"`, or a title matching `/^\s*(?:web search|search the web|(?:run(?:ning)?\s+)?(?:web_search|search_web)\s*$)/iu`.
- Antigravity's `search_web` sets none of those: no `variant`, no `action` in `rawOutput`, and the harness titles the step `Searched` (its render info carries a separate `search: web` field, which ACP does not forward).
- [adapter.ts:4833](/home/mohammed/.t3/projects/t3code/packages/provider-acp/src/server/adapter.ts:4833) — the fallback that builds the `file_search` item; [adapter.ts:1453](/home/mohammed/.t3/projects/t3code/packages/provider-acp/src/server/adapter.ts:1453) is where `rawInput.query` is treated as a path (`fromQuery: true`), and [toolActivity.ts:415](/home/mohammed/.t3/projects/t3code/packages/shared/src/toolActivity.ts:415) produces the `Searched <query>` title.

## History

Title-based detection for this case was added by PR #38106 ("classify web search by title and omit fake filename results", merged 2026-11-19, commit `d530ef339b`). Its fixtures cover only the titles `Web search` and `Running search_web` ([acp-mock-agent.ts:1422](/home/mohammed/.t3/projects/t3code/apps/server/scripts/acp-mock-agent.ts:1422)); the title Antigravity actually sends, `Searched`, is not among them.
