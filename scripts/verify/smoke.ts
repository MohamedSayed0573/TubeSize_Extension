import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Page, Worker } from "playwright-core";

import {
    launchExtension,
    openToolbarPopup,
    readPageSummary,
    resolveTargetUrl,
    type RuntimeIssue,
    waitForSettle,
} from "./browser";
import {
    FIXTURE_WEBSOCKET_HANDLER,
    handleUsageFixtureRequest,
    installPlatformRoutes,
    REALTIME_MODULE_WORKER_EXPECTED_BYTES,
    REALTIME_WS_EXPECTED_BYTES,
    resolveFixtureTarget,
    upgradeFixtureWebSocket,
} from "./fixtures";
import { applySeed, inspectDb } from "./seed";

export interface SmokeStepResult {
    name: string;
    passed: boolean;
    durationMs: number;
    detail: string;
    error?: string;
    issues: RuntimeIssue[];
}

export interface SmokeReport {
    passed: boolean;
    extId: string;
    totalDurationMs: number;
    steps: SmokeStepResult[];
    issues: RuntimeIssue[];
}

interface ExportedUsageDay {
    day?: unknown;
    usage?: unknown;
}

interface QualityMenuAudit {
    badges: Record<string, string | null>;
    premiumHasBadge: boolean;
    autoHasBadge: boolean;
}

const EXPECTED_USAGE_BYTES = 570_000;
const USAGE_FLUSH_SETTLE_MS = 3_500;

async function pollUntil<T>(
    fn: () => Promise<T>,
    predicate: (value: T) => boolean,
    opts: { timeoutMs: number; intervalMs?: number; description: string },
): Promise<T> {
    const intervalMs = opts.intervalMs ?? 150;
    const deadline = Date.now() + opts.timeoutMs;
    let lastValue: T | undefined;
    let hasValue = false;

    while (true) {
        lastValue = await fn();
        hasValue = true;
        if (predicate(lastValue)) return lastValue;
        if (Date.now() >= deadline) break;
        await Bun.sleep(intervalMs);
    }

    const observed = hasValue ? JSON.stringify(lastValue) : "none";
    throw new Error(`Timed out waiting for ${opts.description} (last observed: ${observed})`);
}

async function getBadgeText(serviceWorker: Worker): Promise<string> {
    return await serviceWorker.evaluate(async () => await chrome.action.getBadgeText({}));
}

async function assertPopupSettles(opts: {
    popupPage: Page;
    requiredPatterns: readonly { label: string; pattern: RegExp }[];
}): Promise<string> {
    await opts.popupPage.waitForFunction(
        () => {
            const root = document.getElementById("root");
            if (!root) return false;
            if (root.querySelector('[data-slot="skeleton"], .animate-spin')) return false;
            const txt = root.innerText.trim();
            return /\b\d+p\b/.test(txt) && /\b(?:B|KB|MB|GB)\b/.test(txt);
        },
        undefined,
        { timeout: 10_000 },
    );

    const summary = await readPageSummary(opts.popupPage);
    if (summary.hasErrorBoundary) {
        throw new Error("Popup rendered an error boundary.");
    }

    const text = await opts.popupPage.evaluate(() => {
        const root = document.getElementById("root") ?? document.body;
        return (root?.innerText || "").trim();
    });

    for (const { label, pattern } of opts.requiredPatterns) {
        if (!pattern.test(text)) {
            throw new Error(
                `Popup missing expected ${label} (${pattern}). Text: ${text.slice(0, 300)}`,
            );
        }
    }

    return text;
}

async function navigateMainPage(
    page: Page,
    target: { url: string; viewport?: { width: number; height: number } },
): Promise<void> {
    if (target.viewport) await page.setViewportSize(target.viewport);
    await page.goto(target.url, { waitUntil: "domcontentloaded" });
    const ready = await waitForSettle(page, 6_000);
    if (!ready) {
        throw new Error(`Page did not settle after navigating to ${target.url}`);
    }
    const summary = await readPageSummary(page);
    if (summary.hasErrorBoundary) {
        throw new Error(`Error boundary rendered on ${target.url}`);
    }
}

export async function runSmoke(opts: { extDir: string; timeoutMs: number }): Promise<SmokeReport> {
    const suiteStartedAt = performance.now();
    let server: Bun.Server<undefined> | null = null;
    let launchPromise: Promise<Awaited<ReturnType<typeof launchExtension>>> | null = null;
    let browser: Awaited<ReturnType<typeof launchExtension>> | null = null;
    let closePopupFn: (() => Promise<void>) | null = null;
    let cleanupPromise: Promise<void> | null = null;
    let interrupted = false;
    let signalExitScheduled = false;

    const closeActivePopup = async () => {
        if (!closePopupFn) return;
        const close = closePopupFn;
        closePopupFn = null;
        await close();
    };

    const cleanup = (): Promise<void> => {
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
            await closeActivePopup();
            if (server) {
                try {
                    await server.stop(true);
                } catch {
                    // Server already stopped.
                }
                server = null;
            }
            if (launchPromise) {
                try {
                    browser = await launchPromise;
                } catch {
                    // launchExtension cleans up its own ephemeral profile on failure.
                }
                launchPromise = null;
            }
            if (browser) {
                await browser.close();
                browser = null;
            }
        })();
        return cleanupPromise;
    };

    const onSignal = (sig: NodeJS.Signals) => {
        interrupted = true;
        if (signalExitScheduled) return;
        signalExitScheduled = true;
        void cleanup().finally(() => {
            process.exit(sig === "SIGINT" ? 130 : 143);
        });
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
        server = Bun.serve({
            hostname: "127.0.0.1",
            port: 0,
            websocket: FIXTURE_WEBSOCKET_HANDLER,
            fetch(req, srv) {
                if (upgradeFixtureWebSocket(req, srv)) return undefined;
                return handleUsageFixtureRequest(req) ?? new Response("Not found", { status: 404 });
            },
        });
        const serverPort = server.port ?? 0;
        if (!serverPort) {
            throw new Error("Smoke fixture server failed to bind a local port.");
        }

        launchPromise = launchExtension(opts.extDir, opts.timeoutMs, { enableCdp: true });
        browser = await launchPromise;
        launchPromise = null;
        if (interrupted) {
            await cleanup();
            process.exit(130);
        }

        const {
            extId,
            profileDir,
            context,
            page: mainPage,
            serviceWorker,
            cdpPort,
            issues,
        } = browser;
        if (!cdpPort) {
            throw new Error("CDP port was not assigned for smoke session.");
        }

        await installPlatformRoutes(context);

        const withToolbarPopup = async <T>(fn: (popupPage: Page) => Promise<T>): Promise<T> => {
            await closeActivePopup();
            const opened = await openToolbarPopup({
                mainPage,
                serviceWorker,
                cdpPort,
                extId,
                issues,
                timeoutMs: 6_000,
            });
            closePopupFn = opened.close;
            try {
                return await fn(opened.popupPage);
            } finally {
                await closeActivePopup();
            }
        };

        const steps: SmokeStepResult[] = [];
        let lastTrackedSiteLeftAt = 0;

        const runStep = async (name: string, fn: () => Promise<string>): Promise<void> => {
            const startedAt = performance.now();
            const issueStart = issues.length;
            let detail = "";
            let error: string | undefined;

            try {
                detail = await fn();
            } catch (err) {
                error = err instanceof Error ? err.message : String(err);
            } finally {
                await closeActivePopup();
            }

            const stepIssues = issues.slice(issueStart);
            if (!error && stepIssues.length > 0) {
                error = `${stepIssues.length} runtime issue(s): ${stepIssues.map((i) => `${i.source}/${i.level}: ${i.message}`).join("; ")}`;
            }

            steps.push({
                name,
                passed: !error,
                durationMs: Math.round(performance.now() - startedAt),
                detail,
                ...(error ? { error } : {}),
                issues: stepIssues,
            });
        };

        // 1. Dual-path usage tracking + toolbar badge + HEAD exclusion
        await runStep("usage-tracking", async () => {
            await applySeed(serviceWorker, "empty");
            await serviceWorker.evaluate(async () => {
                await chrome.action.setBadgeText({ text: "" });
                await chrome.storage.sync.set({
                    language: "en",
                    advancedView: false,
                    toasterEnabled: true,
                    toasterThreshold: 500,
                });
                await chrome.storage.local.remove("toasterSuppressedDate");
            });

            const target = resolveFixtureTarget("fixture:usage-site", serverPort);
            const origin = new URL(target.url).origin;
            await navigateMainPage(mainPage, target);

            await mainPage.locator("#btn-all").click();
            await mainPage.waitForFunction(
                () =>
                    (document.getElementById("usage-status")?.textContent ?? "").includes(
                        "Done: 570000 bytes expected",
                    ),
                undefined,
                { timeout: 10_000 },
            );

            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => db.todayUsage[origin] === EXPECTED_USAGE_BYTES,
                {
                    timeoutMs: 8_000,
                    description: `todayUsage[${origin}] === ${EXPECTED_USAGE_BYTES}`,
                },
            );

            const badgeText = await pollUntil(
                () => getBadgeText(serviceWorker),
                (text) => text === "570K",
                {
                    timeoutMs: 4_000,
                    description: 'toolbar badge text === "570K"',
                },
            );

            const dbAfter = await inspectDb(serviceWorker);
            if (dbAfter.todayUsage[origin] !== EXPECTED_USAGE_BYTES) {
                throw new Error(
                    `Expected exact ${EXPECTED_USAGE_BYTES} bytes for ${origin}, got ${String(dbAfter.todayUsage[origin])}`,
                );
            }

            return `${EXPECTED_USAGE_BYTES.toLocaleString("en-US")} B recorded for ${origin}, badge "${badgeText}"`;
        });

        await runStep("realtime-call", async () => {
            await applySeed(serviceWorker, "empty");
            await serviceWorker.evaluate(async () => {
                await chrome.action.setBadgeText({ text: "" });
            });

            const target = resolveFixtureTarget("fixture:realtime-call", serverPort);
            const origin = new URL(target.url).origin;
            await navigateMainPage(mainPage, target);

            await mainPage.locator("#btn-ws").click();
            await mainPage.waitForFunction(
                (expected: number) =>
                    (document.getElementById("ws-status")?.textContent ?? "").includes(
                        `WebSocket ${expected} done`,
                    ),
                REALTIME_WS_EXPECTED_BYTES,
                { timeout: 10_000 },
            );
            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => db.todayUsage[origin] === REALTIME_WS_EXPECTED_BYTES,
                {
                    timeoutMs: 8_000,
                    description: `todayUsage[${origin}] === ${REALTIME_WS_EXPECTED_BYTES} after WebSocket`,
                },
            );

            const expectedAfterWorker =
                REALTIME_WS_EXPECTED_BYTES + REALTIME_MODULE_WORKER_EXPECTED_BYTES;
            await mainPage.locator("#btn-module-worker").click();
            await mainPage.waitForFunction(
                (expected: number) =>
                    (document.getElementById("worker-status")?.textContent ?? "").includes(
                        `Module worker ${expected} done`,
                    ),
                REALTIME_MODULE_WORKER_EXPECTED_BYTES,
                { timeout: 10_000 },
            );
            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => db.todayUsage[origin] === expectedAfterWorker,
                {
                    timeoutMs: 8_000,
                    description: `todayUsage[${origin}] === ${expectedAfterWorker} after module worker`,
                },
            );

            await mainPage.locator("#btn-webrtc").click();
            await mainPage.waitForFunction(
                () =>
                    (document.getElementById("webrtc-status")?.textContent ?? "").includes(
                        "WebRTC call done:",
                    ),
                undefined,
                { timeout: 15_000 },
            );
            const expectedRtcBytes = await mainPage.evaluate(() => {
                const raw = document.getElementById("webrtc-status")?.dataset.rtcBytes;
                return raw ? Number(raw) : NaN;
            });
            if (!Number.isFinite(expectedRtcBytes) || expectedRtcBytes < 150_000) {
                throw new Error(
                    `Expected WebRTC loopback transport bytes >= 150000, got ${String(expectedRtcBytes)}`,
                );
            }

            const minRtcBytes = Math.floor(expectedRtcBytes * 0.85);
            const maxRtcBytes = Math.ceil(expectedRtcBytes * 1.25);
            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => (db.todayUsage[origin] ?? 0) >= expectedAfterWorker + minRtcBytes,
                {
                    timeoutMs: 10_000,
                    description: `todayUsage[${origin}] >= ${expectedAfterWorker + minRtcBytes} after WebRTC`,
                },
            );

            await Bun.sleep(USAGE_FLUSH_SETTLE_MS);
            const dbAfter = await inspectDb(serviceWorker);
            const rtcDelta = (dbAfter.todayUsage[origin] ?? 0) - expectedAfterWorker;
            if (rtcDelta < minRtcBytes || rtcDelta > maxRtcBytes) {
                throw new Error(
                    `WebRTC recorded delta ${rtcDelta} B outside expected [${minRtcBytes}, ${maxRtcBytes}] B (transport ${expectedRtcBytes} B)`,
                );
            }

            const badgeText = await pollUntil(
                () => getBadgeText(serviceWorker),
                (text) => text.length > 0,
                {
                    timeoutMs: 4_000,
                    description: "non-empty toolbar badge text after realtime-call",
                },
            );

            return `WS ${REALTIME_WS_EXPECTED_BYTES.toLocaleString("en-US")} B, module worker ${REALTIME_MODULE_WORKER_EXPECTED_BYTES.toLocaleString("en-US")} B, WebRTC ${rtcDelta.toLocaleString("en-US")} B recorded vs ${expectedRtcBytes.toLocaleString("en-US")} B transport, badge "${badgeText}"`;
        });

        await runStep("youtube-vod", async () => {
            const target = resolveFixtureTarget("fixture:youtube-vod", serverPort);
            await navigateMainPage(mainPage, target);

            // Upshift from default 1080p (154 MB/hour <= 500) to 2160p (1.31 GB/hour > 500) to trigger toaster.
            await mainPage.getByRole("button", { name: "Set video 2160p" }).click();
            const toastHost = mainPage.locator("#TubeSize-Toast-Host");
            await toastHost.waitFor({ state: "visible", timeout: 10_000 });
            const toastText = (await toastHost.locator(".container").innerText()).trim();
            if (!/\b2160p\b/.test(toastText) || !/\b500\b/.test(toastText)) {
                throw new Error(`Unexpected toast content: ${toastText}`);
            }

            await toastHost.getByRole("button", { name: "OK", exact: true }).click();
            await toastHost.waitFor({ state: "hidden", timeout: 5_000 });

            await mainPage.getByRole("button", { name: "Open Quality Menu" }).click();
            await mainPage
                .locator(".ytp-quality-menu .tubesize-quality-menu-panel")
                .first()
                .waitFor({ state: "visible", timeout: 10_000 });

            const menuAudit = await mainPage.evaluate((): QualityMenuAudit => {
                const badges: Record<string, string | null> = {};
                let premiumHasBadge = false;
                let autoHasBadge = false;

                for (const label of document.querySelectorAll(
                    ".ytp-quality-menu .ytp-menuitem-label",
                )) {
                    const span = label.querySelector("div > span");
                    const badge = label.querySelector(".tubesize-quality-menu-panel");
                    const badgeText = badge?.textContent?.trim() ?? null;
                    if (!span) continue;

                    if (span.querySelector(".ytp-premium-label")) {
                        premiumHasBadge = badge !== null;
                        continue;
                    }

                    const text = span.textContent?.trim() ?? "";
                    if (text === "Auto") {
                        autoHasBadge = badge !== null;
                        continue;
                    }

                    badges[text] = badgeText;
                }

                return { badges, premiumHasBadge, autoHasBadge };
            });

            for (const resolution of ["2160p", "1080p", "720p"]) {
                const badge = menuAudit.badges[resolution];
                if (!badge || !/\b(?:KB|MB|GB)\b/.test(badge)) {
                    throw new Error(
                        `Expected SI size badge for ${resolution} in quality menu, got ${JSON.stringify(badge)}`,
                    );
                }
            }
            if (menuAudit.premiumHasBadge) {
                throw new Error("1080p Premium row should not receive an injected size badge.");
            }
            if (menuAudit.autoHasBadge) {
                throw new Error("Auto row should not receive an injected size badge.");
            }

            await withToolbarPopup(async (popupPage) => {
                await assertPopupSettles({
                    popupPage,
                    requiredPatterns: [
                        { label: "1080p resolution", pattern: /\b1080p\b/ },
                        { label: "SI size unit (MB/GB)", pattern: /\b(?:MB|GB)\b/ },
                    ],
                });
            });

            return `toaster triggered & dismissed, quality badges (${menuAudit.badges["1080p"]} @ 1080p, skipped Premium & Auto), popup settled`;
        });

        await runStep("twitch-and-kick-live", async () => {
            const expectedResolutions = ["1080p", "720p", "480p"] as const;
            const assertLivePopupRates = async (platform: string, popupPage: Page) => {
                await assertPopupSettles({
                    popupPage,
                    requiredPatterns: [
                        { label: "hourly SI rate", pattern: /\b(?:KB|MB|GB)\/hour\b/ },
                        { label: "per-minute SI rate", pattern: /\b(?:KB|MB|GB)\/min\b/ },
                    ],
                });

                const rows = await popupPage.evaluate(() =>
                    Array.from(document.querySelectorAll<HTMLElement>('#root div[dir="ltr"]')).map(
                        (el) => el.innerText.replaceAll(/\s+/g, " ").trim(),
                    ),
                );

                for (const res of expectedResolutions) {
                    const rowPattern = new RegExp(`\\b${res}\\b`);
                    const row = rows.find((text) => rowPattern.test(text));
                    if (!row) {
                        throw new Error(
                            `${platform} live popup missing ${res} format row. Rows: ${JSON.stringify(rows)}`,
                        );
                    }
                    if (!/\b(?:KB|MB|GB)\/hour\b/.test(row) || !/\b(?:KB|MB|GB)\/min\b/.test(row)) {
                        throw new Error(
                            `${platform} live popup ${res} row missing required /hour and /min rates: ${JSON.stringify(row)}`,
                        );
                    }
                }
            };

            await navigateMainPage(
                mainPage,
                resolveFixtureTarget("fixture:twitch-live", serverPort),
            );
            await withToolbarPopup(async (popupPage) => {
                await assertLivePopupRates("Twitch", popupPage);
            });

            await navigateMainPage(mainPage, resolveFixtureTarget("fixture:kick-live", serverPort));
            await withToolbarPopup(async (popupPage) => {
                await assertLivePopupRates("Kick", popupPage);
            });

            return "Twitch & Kick live popups settled with 1080p/720p/480p /hour and /min SI rates";
        });

        await runStep("settings-and-rtl", async () => {
            lastTrackedSiteLeftAt = Date.now();
            try {
                await navigateMainPage(mainPage, resolveTargetUrl(extId, "settings"));

                const advancedSwitch = mainPage.getByRole("switch", {
                    name: "Enable advanced view",
                });
                await advancedSwitch.waitFor({ state: "visible", timeout: 5_000 });
                await advancedSwitch.click();
                await mainPage.waitForFunction(
                    () =>
                        document
                            .querySelector('label[for="advancedViewToggle"] ~ [role="switch"]')
                            ?.getAttribute("aria-checked") === "true",
                    undefined,
                    { timeout: 5_000 },
                );

                await mainPage.getByRole("combobox", { name: "Language" }).click();
                await mainPage.getByRole("option", { name: "العربية" }).click();
                await mainPage.waitForFunction(
                    () =>
                        document.documentElement.dir === "rtl" &&
                        document.documentElement.lang === "ar",
                    undefined,
                    { timeout: 5_000 },
                );

                await mainPage.reload({ waitUntil: "domcontentloaded" });
                const settled = await waitForSettle(mainPage, 6_000);
                if (!settled) {
                    throw new Error("Settings page did not settle after reload.");
                }
                const summary = await readPageSummary(mainPage);
                if (summary.hasErrorBoundary) {
                    throw new Error("Settings page rendered an error boundary after reload.");
                }

                const docAttrs = await mainPage.evaluate(() => ({
                    dir: document.documentElement.dir,
                    lang: document.documentElement.lang,
                }));
                if (docAttrs.dir !== "rtl" || docAttrs.lang !== "ar") {
                    throw new Error(
                        `Expected dir="rtl" and lang="ar" after reload, got dir=${JSON.stringify(docAttrs.dir)}, lang=${JSON.stringify(docAttrs.lang)}`,
                    );
                }

                const sync = await serviceWorker.evaluate(
                    async () =>
                        (await chrome.storage.sync.get(null)) as {
                            advancedView?: unknown;
                            language?: unknown;
                        },
                );
                if (sync.advancedView !== true || sync.language !== "ar") {
                    throw new Error(
                        `Expected chrome.storage.sync { advancedView: true, language: "ar" }, got ${JSON.stringify(sync)}`,
                    );
                }

                return 'advancedView=true & language="ar" (dir=rtl) persisted across reload';
            } finally {
                await serviceWorker.evaluate(async () => {
                    await chrome.storage.sync.set({ language: "en", advancedView: false });
                });
            }
        });

        await runStep("dashboard-lifecycle", async () => {
            // Wait for any buffered webRequest usage from earlier platform fixture pages (3s auto-flush)
            // to settle before seeding, so late background flushes cannot perturb exact byte assertions.
            if (lastTrackedSiteLeftAt > 0) {
                const remainingMs = USAGE_FLUSH_SETTLE_MS - (Date.now() - lastTrackedSiteLeftAt);
                if (remainingMs > 0) await Bun.sleep(remainingMs);
            }

            await serviceWorker.evaluate(async () => {
                await chrome.storage.sync.set({ language: "en", advancedView: false });
            });
            const seeded = await applySeed(serviceWorker, "full");
            await navigateMainPage(mainPage, resolveTargetUrl(extId, "daily"));

            const chartBar = mainPage.locator(".recharts-bar-rectangle").first();
            await chartBar.waitFor({ state: "visible", timeout: 10_000 });

            const [download] = await Promise.all([
                mainPage.waitForEvent("download", { timeout: 10_000 }),
                mainPage.getByRole("button", { name: "Export To JSON" }).click(),
            ]);
            const exportPath = join(
                profileDir,
                download.suggestedFilename() || "tubesize-export.json",
            );
            await download.saveAs(exportPath);

            const parsed = JSON.parse(readFileSync(exportPath, "utf8")) as unknown;
            if (!Array.isArray(parsed) || parsed.length !== 14) {
                throw new Error(
                    `Expected exported JSON array with 14 days, got ${Array.isArray(parsed) ? `length ${parsed.length}` : typeof parsed}`,
                );
            }
            for (const entry of parsed as ExportedUsageDay[]) {
                if (
                    typeof entry?.day !== "string" ||
                    !entry.usage ||
                    typeof entry.usage !== "object"
                ) {
                    throw new Error(`Invalid exported day entry: ${JSON.stringify(entry)}`);
                }
            }

            await mainPage.getByRole("button", { name: "Clear All Usage Data" }).click();
            await mainPage.getByRole("button", { name: "Continue" }).click();
            await mainPage
                .getByText("No usage data available.")
                .waitFor({ state: "visible", timeout: 10_000 });

            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => db.siteUsageDays === 0,
                {
                    timeoutMs: 6_000,
                    description: "siteUsageDays === 0 after Clear All",
                },
            );
            await pollUntil(
                () => getBadgeText(serviceWorker),
                (text) => text === "",
                {
                    timeoutMs: 4_000,
                    description: 'badge text === "" after Clear All',
                },
            );

            const [chooser] = await Promise.all([
                mainPage.waitForEvent("filechooser", { timeout: 10_000 }),
                mainPage.getByRole("button", { name: "Import JSON" }).click(),
            ]);
            await chooser.setFiles(exportPath);

            await chartBar.waitFor({ state: "visible", timeout: 10_000 });

            await pollUntil(
                () => inspectDb(serviceWorker),
                (db) => db.siteUsageDays === 14 && db.totalBytes === seeded.totalBytes,
                {
                    timeoutMs: 6_000,
                    description: `siteUsageDays === 14 && totalBytes === ${seeded.totalBytes} after Import JSON`,
                },
            );
            const restoredBadge = await pollUntil(
                () => getBadgeText(serviceWorker),
                (text) => text.length > 0,
                {
                    timeoutMs: 4_000,
                    description: "non-empty badge text after Import JSON",
                },
            );

            const summary = await readPageSummary(mainPage);
            if (summary.hasErrorBoundary) {
                throw new Error("Dashboard rendered an error boundary after Import JSON.");
            }

            return `exported 14d JSON, cleared to 0d (badge ""), restored 14d (${seeded.totalBytes.toLocaleString("en-US")} B, badge "${restoredBadge}")`;
        });

        const passed = steps.every((s) => s.passed) && issues.length === 0;
        return {
            passed,
            extId,
            totalDurationMs: Math.round(performance.now() - suiteStartedAt),
            steps,
            issues: [...issues],
        };
    } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
        await cleanup();
    }
}
