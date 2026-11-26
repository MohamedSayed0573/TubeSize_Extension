import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { type Browser, type Page, type Worker } from "playwright-core";

import CONFIG from "../../src/lib/constants";
import { openToolbarPopup, type RuntimeIssue, waitForSettle } from "./browser";
import { inspectDb } from "./seed";

export interface MetricSummary {
    runs: number;
    min: number;
    median: number;
    p95: number;
    max: number;
    mean: number;
}

interface BundleFileEntry {
    path: string;
    bytes: number;
}

export interface BundleBuildReport {
    dir: string;
    totalBytes: number;
    fileCount: number;
    categories: Record<string, number>;
    largestFiles: BundleFileEntry[];
    fileBytes: Record<string, number>;
    manifestContentScripts: string[] | null;
}

export interface BundlePerfReport {
    chrome: BundleBuildReport | null;
    firefox: BundleBuildReport | null;
}

type BundleTarget = "chrome-mv3" | "firefox-mv3";

interface BundleBudgetConfig {
    readonly totalBytes: number;
    readonly contentScriptsTotalBytes: number;
    readonly files: Readonly<Record<string, number>>;
}

interface BundleBudgetCheck {
    target: BundleTarget;
    metric: string;
    actualBytes: number | null;
    budgetBytes: number;
    passed: boolean;
    reason?:
        | "missing-build"
        | "missing-file"
        | "over-budget"
        | "invalid-manifest"
        | "unbudgeted-content-script";
}

export interface BundleBudgetEvaluation {
    passed: boolean;
    missingBuilds: BundleTarget[];
    checks: BundleBudgetCheck[];
    failures: BundleBudgetCheck[];
}

export const BUNDLE_BUDGETS = {
    totalBytes: 3_200_000,
    contentScriptsTotalBytes: 80_000,
    files: {
        "background.js": 800_000,
        "content-scripts/genericObserver.js": 8_000,
        "content-scripts/usageBridge.js": 10_000,
        "content-scripts/content.js": 65_000,
    },
} as const satisfies BundleBudgetConfig;

interface PopupPerfSample {
    run: number;
    openToTargetMs: number;
    openToSettledMs: number;
    popupNavToSettledMs: number;
    domContentLoadedMs: number | null;
    fcpMs: number | null;
    formatRowsTextLength: number;
}

export interface PopupPerfReport {
    target: string;
    url: string;
    cached: boolean;
    runs: number;
    samples: PopupPerfSample[];
    summary: {
        openToSettledMs: MetricSummary;
        popupNavToSettledMs: MetricSummary;
        domContentLoadedMs: MetricSummary | null;
        fcpMs: MetricSummary | null;
    };
    popupHeapUsedBytes: number | null;
    popupDomNodes: number | null;
    mediaCacheKeysAfter: string[];
}

interface DashboardPerfSample {
    run: number;
    wallToDataReadyMs: number;
    navToDataReadyMs: number;
    domContentLoadedMs: number | null;
    fcpMs: number | null;
}

export interface DashboardPerfReport {
    target: string;
    url: string;
    seed: string | null;
    runs: number;
    dbDays: number;
    dbVideos: number;
    samples: DashboardPerfSample[];
    summary: {
        wallToDataReadyMs: MetricSummary;
        navToDataReadyMs: MetricSummary;
        domContentLoadedMs: MetricSummary | null;
        fcpMs: MetricSummary | null;
    };
    pageHeapUsedBytes: number | null;
    pageDomNodes: number | null;
    pageEventListeners: number | null;
}

export interface MemoryPerfReport {
    serviceWorker: {
        usedHeapBytes: number;
        totalHeapBytes: number;
        embedderHeapUsedBytes: number;
    } | null;
    activePage: {
        url: string;
        surface: "popup" | "tab";
        usedHeapBytes: number | null;
        totalHeapBytes: number | null;
        domNodes: number | null;
        jsEventListeners: number | null;
    };
    storage: {
        localBytes: number;
        syncBytes: number;
    };
    indexedDb: {
        siteUsageDays: number;
        watchHistoryDays: number;
        videoMetaCount: number;
        totalBytes: number;
    };
    chromiumProcesses: {
        totalRssBytes: number;
        processCount: number;
        byType: Record<string, { count: number; rssBytes: number }>;
    } | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

function summarizeNumbers(raw: number[]): MetricSummary {
    const sorted = [...raw].toSorted((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return { runs: 0, min: 0, median: 0, p95: 0, max: 0, mean: 0 };
    const mid = Math.floor(n / 2);
    const median = n % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
    const p95Idx = Math.min(n - 1, Math.ceil(n * 0.95) - 1);
    const mean = sorted.reduce((acc, v) => acc + v, 0) / n;
    return {
        runs: n,
        min: round1(sorted[0]!),
        median: round1(median),
        p95: round1(sorted[p95Idx]!),
        max: round1(sorted.at(-1)!),
        mean: round1(mean),
    };
}

function summarizeOptional(raw: Array<number | null>): MetricSummary | null {
    const nums = raw.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
    return nums.length > 0 ? summarizeNumbers(nums) : null;
}

function categorizeBundleFile(relPath: string): string {
    if (relPath === "background.js" || relPath.startsWith("background")) return "background";
    if (relPath.startsWith("content-scripts/")) return "contentScripts";
    if (relPath.startsWith("chunks/")) return "chunks";
    if (relPath.startsWith("assets/")) return "assets";
    if (relPath.endsWith(".html")) return "html";
    if (relPath.startsWith("_locales/")) return "locales";
    if (relPath.startsWith("icons/") || relPath.endsWith(".svg") || relPath.endsWith(".png")) {
        return "iconsAndImages";
    }
    return "other";
}

function readManifestContentScripts(buildDir: string): string[] | null {
    const manifestPath = join(buildDir, "manifest.json");
    if (!existsSync(manifestPath)) return null;
    try {
        const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as {
            content_scripts?: unknown;
        };
        if (!Array.isArray(parsed.content_scripts)) return null;
        const assets = new Set<string>();
        for (const entry of parsed.content_scripts) {
            if (!entry || typeof entry !== "object") return null;
            const record = entry as { js?: unknown; css?: unknown };
            for (const list of [record.js, record.css]) {
                if (list === undefined) continue;
                if (!Array.isArray(list)) return null;
                for (const item of list) {
                    if (typeof item !== "string" || item.trim().length === 0) return null;
                    assets.add(item.replaceAll("\\", "/").replace(/^\.?\//, ""));
                }
            }
        }
        return [...assets].toSorted((a, b) => a.localeCompare(b));
    } catch {
        return null;
    }
}

function scanBuildDir(rootDir: string, buildDir: string): BundleBuildReport | null {
    if (!existsSync(buildDir)) return null;
    const files: BundleFileEntry[] = [];
    const stack = [buildDir];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        const st = statSync(cur);
        if (st.isDirectory()) {
            for (const entry of readdirSync(cur)) stack.push(join(cur, entry));
        } else {
            files.push({
                path: relative(buildDir, cur).replaceAll("\\", "/"),
                bytes: st.size,
            });
        }
    }
    const categories: Record<string, number> = {};
    let totalBytes = 0;
    for (const f of files) {
        totalBytes += f.bytes;
        const cat = categorizeBundleFile(f.path);
        categories[cat] = (categories[cat] ?? 0) + f.bytes;
    }
    const largestFiles = [...files].toSorted((a, b) => b.bytes - a.bytes).slice(0, 8);
    const fileBytes: Record<string, number> = {};
    for (const f of [...files].toSorted((a, b) => a.path.localeCompare(b.path))) {
        fileBytes[f.path] = f.bytes;
    }
    return {
        dir: relative(rootDir, buildDir).replaceAll("\\", "/"),
        totalBytes,
        fileCount: files.length,
        categories,
        largestFiles,
        fileBytes,
        manifestContentScripts: readManifestContentScripts(buildDir),
    };
}

export function measureBundle(rootDir: string): BundlePerfReport {
    return {
        chrome: scanBuildDir(rootDir, resolve(rootDir, ".output", "chrome-mv3")),
        firefox: scanBuildDir(rootDir, resolve(rootDir, ".output", "firefox-mv3")),
    };
}

export function evaluateBundleBudgets(
    report: BundlePerfReport,
    budgets: BundleBudgetConfig = BUNDLE_BUDGETS,
): BundleBudgetEvaluation {
    const targets: ReadonlyArray<readonly [BundleTarget, BundleBuildReport | null]> = [
        ["chrome-mv3", report.chrome],
        ["firefox-mv3", report.firefox],
    ];
    const missingBuilds: BundleTarget[] = [];
    const checks: BundleBudgetCheck[] = [];

    for (const [target, build] of targets) {
        if (!build) {
            missingBuilds.push(target);
            checks.push({
                target,
                metric: "total",
                actualBytes: null,
                budgetBytes: budgets.totalBytes,
                passed: false,
                reason: "missing-build",
            });
            continue;
        }

        const totalPassed = build.totalBytes <= budgets.totalBytes;
        checks.push({
            target,
            metric: "total",
            actualBytes: build.totalBytes,
            budgetBytes: budgets.totalBytes,
            passed: totalPassed,
            ...(totalPassed ? {} : { reason: "over-budget" as const }),
        });

        if (build.manifestContentScripts === null) {
            checks.push({
                target,
                metric: "manifest:content_scripts",
                actualBytes: null,
                budgetBytes: budgets.contentScriptsTotalBytes,
                passed: false,
                reason: "invalid-manifest",
            });
        } else {
            let manifestTotalBytes = 0;
            for (const assetPath of build.manifestContentScripts) {
                const actual = build.fileBytes[assetPath];
                if (typeof actual === "number" && Number.isFinite(actual)) {
                    manifestTotalBytes += actual;
                }
            }
            const manifestTotalPassed = manifestTotalBytes <= budgets.contentScriptsTotalBytes;
            checks.push({
                target,
                metric: "manifest:content_scripts",
                actualBytes: manifestTotalBytes,
                budgetBytes: budgets.contentScriptsTotalBytes,
                passed: manifestTotalPassed,
                ...(manifestTotalPassed ? {} : { reason: "over-budget" as const }),
            });
        }

        for (const [filePath, budgetBytes] of Object.entries(budgets.files)) {
            const actual = build.fileBytes[filePath];
            if (typeof actual !== "number" || !Number.isFinite(actual)) {
                checks.push({
                    target,
                    metric: filePath,
                    actualBytes: null,
                    budgetBytes,
                    passed: false,
                    reason: "missing-file",
                });
                continue;
            }

            const filePassed = actual <= budgetBytes;
            checks.push({
                target,
                metric: filePath,
                actualBytes: actual,
                budgetBytes,
                passed: filePassed,
                ...(filePassed ? {} : { reason: "over-budget" as const }),
            });
        }

        const contentScriptAssets = new Set<string>([
            ...(build.manifestContentScripts ?? []),
            ...Object.keys(build.fileBytes).filter((p) => p.startsWith("content-scripts/")),
        ]);
        for (const assetPath of [...contentScriptAssets].toSorted((a, b) => a.localeCompare(b))) {
            if (Object.hasOwn(budgets.files, assetPath)) continue;
            const actual = build.fileBytes[assetPath];
            checks.push({
                target,
                metric: assetPath,
                actualBytes: typeof actual === "number" && Number.isFinite(actual) ? actual : null,
                budgetBytes: 0,
                passed: false,
                reason: "unbudgeted-content-script",
            });
        }
    }

    const failures = checks.filter((c) => !c.passed);
    return {
        passed: missingBuilds.length === 0 && failures.length === 0,
        missingBuilds,
        checks,
        failures,
    };
}

async function queryServiceWorkerHeap(
    cdpPort: number | undefined,
    extId: string,
): Promise<MemoryPerfReport["serviceWorker"]> {
    if (!cdpPort) return null;
    try {
        const res = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
        if (!res.ok) return null;
        const targets = (await res.json()) as Array<{
            type?: string;
            url?: string;
            webSocketDebuggerUrl?: string;
        }>;
        const sw = targets.find(
            (t) => t.url === `chrome-extension://${extId}/background.js` && t.webSocketDebuggerUrl,
        );
        if (!sw?.webSocketDebuggerUrl) return null;

        return await new Promise((resolvePromise) => {
            const ws = new WebSocket(sw.webSocketDebuggerUrl!);
            const timer = setTimeout(() => {
                try {
                    ws.close();
                } catch {
                    // Socket already closed.
                }
                resolvePromise(null);
            }, 3000);
            ws.addEventListener("open", () => {
                ws.send(JSON.stringify({ id: 1, method: "Runtime.getHeapUsage" }));
            });
            ws.addEventListener("message", (ev) => {
                try {
                    const msg = JSON.parse(String(ev.data)) as {
                        id?: number;
                        result?: {
                            usedSize?: number;
                            totalSize?: number;
                            embedderHeapUsedSize?: number;
                        };
                    };
                    if (msg.id !== 1) return;
                    clearTimeout(timer);
                    ws.close();
                    resolvePromise({
                        usedHeapBytes: msg.result?.usedSize ?? 0,
                        totalHeapBytes: msg.result?.totalSize ?? 0,
                        embedderHeapUsedBytes: msg.result?.embedderHeapUsedSize ?? 0,
                    });
                } catch {
                    clearTimeout(timer);
                    ws.close();
                    resolvePromise(null);
                }
            });
            ws.addEventListener("error", () => {
                clearTimeout(timer);
                resolvePromise(null);
            });
        });
    } catch {
        return null;
    }
}

async function readPageCdpMetrics(page: Page): Promise<{
    usedHeapBytes: number | null;
    totalHeapBytes: number | null;
    domNodes: number | null;
    jsEventListeners: number | null;
}> {
    try {
        const cdp = await page.context().newCDPSession(page);
        try {
            await cdp.send("Performance.enable");
            const { metrics } = await cdp.send("Performance.getMetrics");
            const map = new Map(metrics.map((m) => [m.name, m.value]));
            return {
                usedHeapBytes: map.get("JSHeapUsedSize") ?? null,
                totalHeapBytes: map.get("JSHeapTotalSize") ?? null,
                domNodes: map.get("Nodes") ?? null,
                jsEventListeners: map.get("JSEventListeners") ?? null,
            };
        } finally {
            await cdp.detach().catch(() => {});
        }
    } catch {
        return {
            usedHeapBytes: null,
            totalHeapBytes: null,
            domNodes: null,
            jsEventListeners: null,
        };
    }
}

function readProcessRss(profileDir: string, extId: string): MemoryPerfReport["chromiumProcesses"] {
    if (process.platform !== "linux" || !existsSync("/proc")) return null;
    const byType: Record<string, { count: number; rssBytes: number }> = {};
    let totalRssBytes = 0;
    let processCount = 0;

    for (const entry of readdirSync("/proc")) {
        if (!/^\d+$/.test(entry)) continue;
        try {
            const cmd = readFileSync(`/proc/${entry}/cmdline`, "utf8").replaceAll("\0", " ");
            if (!cmd.includes(profileDir) && !cmd.includes(extId)) continue;
            const status = readFileSync(`/proc/${entry}/status`, "utf8");
            const rssMatch = status.match(/VmRSS:\s+(\d+)\s+kB/);
            const rssBytes = rssMatch ? Number(rssMatch[1]) * 1024 : 0;
            const typeMatch = cmd.match(/--type=([^\s]+)/);
            const procType = typeMatch?.[1] ?? "browser";
            const bucket = byType[procType] ?? { count: 0, rssBytes: 0 };
            bucket.count += 1;
            bucket.rssBytes += rssBytes;
            byType[procType] = bucket;
            totalRssBytes += rssBytes;
            processCount += 1;
        } catch {
            // Process exited while scanning /proc.
        }
    }

    return processCount > 0 ? { totalRssBytes, processCount, byType } : null;
}

export async function measureMemoryPerf(opts: {
    activePage: Page;
    surface: "popup" | "tab";
    serviceWorker: Worker;
    cdpPort?: number;
    extId: string;
    profileDir: string;
}): Promise<MemoryPerfReport> {
    const [serviceWorkerHeap, pageMetrics, storage, db] = await Promise.all([
        queryServiceWorkerHeap(opts.cdpPort, opts.extId),
        readPageCdpMetrics(opts.activePage),
        opts.serviceWorker.evaluate(async () => ({
            localBytes: await chrome.storage.local.getBytesInUse(null),
            syncBytes: await chrome.storage.sync.getBytesInUse(null),
        })),
        inspectDb(opts.serviceWorker),
    ]);

    return {
        serviceWorker: serviceWorkerHeap,
        activePage: {
            url: opts.activePage.url(),
            surface: opts.surface,
            ...pageMetrics,
        },
        storage,
        indexedDb: {
            siteUsageDays: db.siteUsageDays,
            watchHistoryDays: db.watchHistoryDays,
            videoMetaCount: db.videoMetaCount,
            totalBytes: db.totalBytes,
        },
        chromiumProcesses: readProcessRss(opts.profileDir, opts.extId),
    };
}

async function clearMediaCaches(serviceWorker: Worker): Promise<void> {
    await serviceWorker.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        const keys = Object.keys(all).filter(
            (k) => k.startsWith("youtube:") || k.startsWith("twitch:") || k.startsWith("kick:"),
        );
        if (keys.length > 0) await chrome.storage.local.remove(keys);
    });
}

async function listMediaCacheKeys(serviceWorker: Worker): Promise<string[]> {
    return await serviceWorker.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        return Object.keys(all)
            .filter(
                (k) => k.startsWith("youtube:") || k.startsWith("twitch:") || k.startsWith("kick:"),
            )
            .sort();
    });
}

async function openAndAttachPopup(opts: {
    mainPage: Page;
    serviceWorker: Worker;
    cdpPort: number;
    extId: string;
    issues: RuntimeIssue[];
}): Promise<{
    popupPage: Page;
    cdpBrowser: Browser;
    openToTargetMs: number;
    t0: number;
}> {
    const opened = await openToolbarPopup({ ...opts, timeoutMs: 5000 });
    return { ...opened, t0: opened.startedAt };
}

async function readPageTimings(page: Page): Promise<{
    navNowMs: number;
    domContentLoadedMs: number | null;
    fcpMs: number | null;
    textLength: number;
}> {
    return await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0] as
            | PerformanceNavigationTiming
            | undefined;
        const fcp = performance
            .getEntriesByType("paint")
            .find((p) => p.name === "first-contentful-paint");
        const root = document.getElementById("root") ?? document.body;
        return {
            navNowMs: performance.now(),
            domContentLoadedMs: nav ? nav.domContentLoadedEventEnd : null,
            fcpMs: fcp ? fcp.startTime : null,
            textLength: (root?.innerText || "").trim().length,
        };
    });
}

export async function measurePopupPerf(opts: {
    target: string;
    url: string;
    viewport?: { width: number; height: number };
    cached: boolean;
    runs: number;
    mainPage: Page;
    serviceWorker: Worker;
    cdpPort?: number;
    extId: string;
    issues: RuntimeIssue[];
}): Promise<PopupPerfReport> {
    if (!opts.cdpPort) throw new Error("CDP port is required to measure popup performance.");

    if (opts.viewport) await opts.mainPage.setViewportSize(opts.viewport);
    await opts.mainPage.goto(opts.url, { waitUntil: "domcontentloaded" });
    await waitForSettle(opts.mainPage, 6000);
    await opts.mainPage.waitForTimeout(300);

    if (opts.cached) {
        const warm = await openAndAttachPopup({
            mainPage: opts.mainPage,
            serviceWorker: opts.serviceWorker,
            cdpPort: opts.cdpPort,
            extId: opts.extId,
            issues: opts.issues,
        });
        try {
            await waitForSettle(warm.popupPage, 8000);
        } finally {
            if (!warm.popupPage.isClosed()) await warm.popupPage.close().catch(() => {});
            await warm.cdpBrowser.close().catch(() => {});
        }
    }

    const samples: PopupPerfSample[] = [];
    let popupHeapUsedBytes: number | null = null;
    let popupDomNodes: number | null = null;

    for (let i = 1; i <= opts.runs; i++) {
        if (!opts.cached) await clearMediaCaches(opts.serviceWorker);

        const opened = await openAndAttachPopup({
            mainPage: opts.mainPage,
            serviceWorker: opts.serviceWorker,
            cdpPort: opts.cdpPort,
            extId: opts.extId,
            issues: opts.issues,
        });
        try {
            await opened.popupPage.waitForFunction(
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
            const openToSettledMs = performance.now() - opened.t0;
            const timings = await readPageTimings(opened.popupPage);

            if (i === opts.runs) {
                const cdpMetrics = await readPageCdpMetrics(opened.popupPage);
                popupHeapUsedBytes = cdpMetrics.usedHeapBytes;
                popupDomNodes = cdpMetrics.domNodes;
            }

            samples.push({
                run: i,
                openToTargetMs: round1(opened.openToTargetMs),
                openToSettledMs: round1(openToSettledMs),
                popupNavToSettledMs: round1(timings.navNowMs),
                domContentLoadedMs:
                    timings.domContentLoadedMs !== null ? round1(timings.domContentLoadedMs) : null,
                fcpMs: timings.fcpMs !== null ? round1(timings.fcpMs) : null,
                formatRowsTextLength: timings.textLength,
            });
        } finally {
            if (!opened.popupPage.isClosed()) await opened.popupPage.close().catch(() => {});
            await opened.cdpBrowser.close().catch(() => {});
        }
    }

    const mediaCacheKeysAfter = await listMediaCacheKeys(opts.serviceWorker);
    return {
        target: opts.target,
        url: opts.url,
        cached: opts.cached,
        runs: opts.runs,
        samples,
        summary: {
            openToSettledMs: summarizeNumbers(samples.map((s) => s.openToSettledMs)),
            popupNavToSettledMs: summarizeNumbers(samples.map((s) => s.popupNavToSettledMs)),
            domContentLoadedMs: summarizeOptional(samples.map((s) => s.domContentLoadedMs)),
            fcpMs: summarizeOptional(samples.map((s) => s.fcpMs)),
        },
        popupHeapUsedBytes,
        popupDomNodes,
        mediaCacheKeysAfter,
    };
}

export async function measureDashboardPerf(opts: {
    target: string;
    url: string;
    viewport?: { width: number; height: number };
    seed: string | null;
    runs: number;
    mainPage: Page;
    serviceWorker: Worker;
}): Promise<DashboardPerfReport> {
    if (!opts.url.includes("/dashboard.html")) {
        throw new Error(`perf dashboard needs a dashboard target, got ${opts.target}.`);
    }
    if (opts.viewport) await opts.mainPage.setViewportSize(opts.viewport);
    const db = await inspectDb(opts.serviceWorker);
    const expectsChart = opts.url.includes("#/daily")
        ? db.siteUsageDays > 0
        : opts.url.includes("#/sites")
          ? Object.values(db.siteTotals).some((bytes) => bytes >= CONFIG.MIN_CHARTED_SITE_BYTES)
          : false;

    const samples: DashboardPerfSample[] = [];
    let pageHeapUsedBytes: number | null = null;
    let pageDomNodes: number | null = null;
    let pageEventListeners: number | null = null;

    for (let i = 1; i <= opts.runs; i++) {
        await opts.mainPage.goto("about:blank", { waitUntil: "domcontentloaded" });

        const t0 = performance.now();
        await opts.mainPage.goto(opts.url, { waitUntil: "domcontentloaded" });
        await opts.mainPage.waitForFunction(
            (needChart: boolean) => {
                const root = document.getElementById("root");
                if (!root) return false;
                if (root.innerText.trim().length === 0) return false;
                if (root.querySelector('[data-slot="skeleton"], .animate-spin')) return false;
                if (needChart && !root.querySelector(".recharts-bar-rectangle")) return false;
                return true;
            },
            expectsChart,
            { timeout: 10_000 },
        );
        await opts.mainPage.evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        });
        const wallToDataReadyMs = performance.now() - t0;
        const timings = await readPageTimings(opts.mainPage);

        if (i === opts.runs) {
            const cdpMetrics = await readPageCdpMetrics(opts.mainPage);
            pageHeapUsedBytes = cdpMetrics.usedHeapBytes;
            pageDomNodes = cdpMetrics.domNodes;
            pageEventListeners = cdpMetrics.jsEventListeners;
        }

        samples.push({
            run: i,
            wallToDataReadyMs: round1(wallToDataReadyMs),
            navToDataReadyMs: round1(timings.navNowMs),
            domContentLoadedMs:
                timings.domContentLoadedMs !== null ? round1(timings.domContentLoadedMs) : null,
            fcpMs: timings.fcpMs !== null ? round1(timings.fcpMs) : null,
        });
    }

    return {
        target: opts.target,
        url: opts.url,
        seed: opts.seed,
        runs: opts.runs,
        dbDays: db.siteUsageDays,
        dbVideos: db.videoMetaCount,
        samples,
        summary: {
            wallToDataReadyMs: summarizeNumbers(samples.map((s) => s.wallToDataReadyMs)),
            navToDataReadyMs: summarizeNumbers(samples.map((s) => s.navToDataReadyMs)),
            domContentLoadedMs: summarizeOptional(samples.map((s) => s.domContentLoadedMs)),
            fcpMs: summarizeOptional(samples.map((s) => s.fcpMs)),
        },
        pageHeapUsedBytes,
        pageDomNodes,
        pageEventListeners,
    };
}
