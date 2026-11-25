import { spawn } from "node:child_process";
import {
    closeSync,
    existsSync,
    mkdirSync,
    openSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

import {
    findChromiumExecutable,
    getLatestMtimeMs,
    launchExtension,
    readPageSummary,
    type RuntimeIssue,
    waitForSettle,
} from "./verify/browser";
import {
    type BundlePerfReport,
    type DashboardPerfReport,
    measureBundle,
    type MemoryPerfReport,
    type MetricSummary,
    type PopupPerfReport,
} from "./verify/perf";

const ROOT = resolve(import.meta.dir, "..");
const EXT_DIR = join(ROOT, ".output", "chrome-mv3");
const EVIDENCE_DIR = join(ROOT, ".verify-evidence");
const STATE_FILE = join(EVIDENCE_DIR, ".session.json");
const LOG_FILE = join(EVIDENCE_DIR, ".session.log");
const SERVER_PATH = join(import.meta.dir, "verify", "server.ts");

const HELP = `TubeSize Verification CLI (Playwright)

Usage: bun run verify <command> [options]

Commands:
  doctor [--timeout <ms>]       Health check: Bun, Chromium, build freshness, MV3 boot
  start [opts]                  Launch isolated Playwright session (--target, --seed, --lang, --prev-version, --build, --timeout)
  status                        Check active session URL, surface, dir, and error count
  stop                          Close active session & delete temp profile (keeps .verify-evidence/)
  goto <target>                 Navigate (popup|settings|daily|sites|today|week|month|lifetime|date:*|platform:*|site:*|fixture:*|URL)
  popup [open|close]            Open or close the real toolbar popup targeting the active tab (default: open)
  snapshot [file] [opts]        Print ARIA tree (--selector <css> to scope, --quiet/-q when saving to file)
  click [locator]               Click (--role <r> [--name <n>] | --label <l> | --text <t> | --selector <css>)
  hover [locator]               Hover an element (e.g. Advanced View tooltips, chart bars)
  fill --value <v> [locator]    Fill an input (locators also accept --exact and --nth <n>)
  press <key> [--repeat <n>]    Press a keyboard key N times (Enter, Escape, ArrowRight, ...)
  wait [--ms <n>] [locator]     Sleep up to 15s and/or wait for a locator (--gone waits for hidden/detached)
  upload <file> [locator]       Click a file-chooser trigger and upload a local file
  download [out] [locator]      Click a download trigger and save the file (default: .verify-evidence/<name>)
  reload                        Reload current page and wait for UI settle
  seed <full|heavy|empty> [--lang] Re-seed IndexedDB (full=14d, heavy=90d, empty=0d) and reload extension pages
  state [--json]                Inspect URL, surface, badge, IndexedDB counts, chrome.storage & errors
  perf <subcmd> [opts]          Benchmark performance: bundle | popup | dashboard | memory | all
                                  Options: --target, --runs <n>, --cached, --seed, --json, --save <file>
  screenshot [path.png]         Capture 2x PNG screenshot (default: .verify-evidence/<timestamp>.png)

Exit codes: 0 verified | 1 failed | 2 inconclusive (missing Chromium, build, or active session)
`;

const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : `${s}\n`);

function formatSiBytes(bytes: number): string {
    if (bytes < 1000) return `${bytes} B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(2)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function formatSummaryMs(s: MetricSummary | null): string {
    if (!s) return "n/a";
    return `median ${s.median} ms (min ${s.min}, p95 ${s.p95}, max ${s.max}, n=${s.runs})`;
}

function printBundlePerf(rep: BundlePerfReport): void {
    out("Bundle Size (decimal SI)");
    for (const [label, b] of [
        ["chrome-mv3", rep.chrome],
        ["firefox-mv3", rep.firefox],
    ] as const) {
        if (!b) {
            out(`  ${label}: not built`);
            continue;
        }
        out(`  ${label}: ${formatSiBytes(b.totalBytes)} across ${b.fileCount} files (${b.dir})`);
        const cats = Object.entries(b.categories)
            .toSorted(([, a], [, c]) => c - a)
            .map(([k, v]) => `${k}=${formatSiBytes(v)}`)
            .join(", ");
        out(`    Categories: ${cats}`);
        const top = b.largestFiles
            .slice(0, 5)
            .map((f) => `${f.path} (${formatSiBytes(f.bytes)})`)
            .join(", ");
        out(`    Largest:    ${top}`);
    }
}

function printPopupPerf(rep: PopupPerfReport): void {
    out(`Popup Size Estimation Perf — ${rep.target} (${rep.cached ? "cached" : "uncached"})`);
    out(`  Popup internal settle: ${formatSummaryMs(rep.summary.popupNavToSettledMs)}`);
    out(`  End-to-end open→ready: ${formatSummaryMs(rep.summary.openToSettledMs)}`);
    out(`  DOMContentLoaded:      ${formatSummaryMs(rep.summary.domContentLoadedMs)}`);
    out(
        `  First Contentful Paint:${rep.summary.fcpMs ? ` ${formatSummaryMs(rep.summary.fcpMs)}` : " n/a"}`,
    );
    if (rep.popupHeapUsedBytes !== null) {
        out(
            `  Popup heap / DOM:      ${formatSiBytes(rep.popupHeapUsedBytes)} / ${rep.popupDomNodes ?? "?"} nodes`,
        );
    }
    out(`  Media cache keys:      ${JSON.stringify(rep.mediaCacheKeysAfter)}`);
}

function printDashboardPerf(rep: DashboardPerfReport): void {
    out(`Dashboard Load Perf — ${rep.target} (DB: ${rep.dbDays} days, ${rep.dbVideos} videos)`);
    out(`  Nav→data ready:        ${formatSummaryMs(rep.summary.navToDataReadyMs)}`);
    out(`  Wall→data ready:       ${formatSummaryMs(rep.summary.wallToDataReadyMs)}`);
    out(`  DOMContentLoaded:      ${formatSummaryMs(rep.summary.domContentLoadedMs)}`);
    out(
        `  First Contentful Paint:${rep.summary.fcpMs ? ` ${formatSummaryMs(rep.summary.fcpMs)}` : " n/a"}`,
    );
    if (rep.pageHeapUsedBytes !== null) {
        out(
            `  Page heap / DOM:       ${formatSiBytes(rep.pageHeapUsedBytes)} / ${rep.pageDomNodes ?? "?"} nodes / ${rep.pageEventListeners ?? "?"} listeners`,
        );
    }
}

function printMemoryPerf(rep: MemoryPerfReport): void {
    out("Extension Memory & Storage Footprint");
    if (rep.serviceWorker) {
        out(
            `  Service worker heap:   ${formatSiBytes(rep.serviceWorker.usedHeapBytes)} used / ${formatSiBytes(rep.serviceWorker.totalHeapBytes)} total (embedder ${formatSiBytes(rep.serviceWorker.embedderHeapUsedBytes)})`,
        );
    } else {
        out("  Service worker heap:   unavailable");
    }
    out(
        `  Active ${rep.activePage.surface.padEnd(5)} heap:     ${rep.activePage.usedHeapBytes !== null ? formatSiBytes(rep.activePage.usedHeapBytes) : "n/a"} (${rep.activePage.domNodes ?? "?"} nodes, ${rep.activePage.jsEventListeners ?? "?"} listeners) — ${rep.activePage.url}`,
    );
    out(
        `  chrome.storage:        local=${formatSiBytes(rep.storage.localBytes)}, sync=${formatSiBytes(rep.storage.syncBytes)}`,
    );
    out(
        `  IndexedDB:             ${rep.indexedDb.siteUsageDays} days, ${rep.indexedDb.videoMetaCount} videos, ${formatSiBytes(rep.indexedDb.totalBytes)} recorded`,
    );
    if (rep.chromiumProcesses) {
        const types = Object.entries(rep.chromiumProcesses.byType)
            .toSorted(([, a], [, b]) => b.rssBytes - a.rssBytes)
            .map(([t, info]) => `${t}x${info.count}=${formatSiBytes(info.rssBytes)}`)
            .join(", ");
        out(
            `  Chromium session RSS:  ${formatSiBytes(rep.chromiumProcesses.totalRssBytes)} (${rep.chromiumProcesses.processCount} procs: ${types})`,
        );
    }
}

function maybeSaveJson(savePath: string | undefined, payload: unknown, toStderr = false): void {
    if (!savePath) return;
    const dest = resolve(savePath);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, `${JSON.stringify(payload, null, 2)}\n`);
    const msg = `Saved perf report → ${relative(ROOT, dest)}\n`;
    if (toStderr) process.stderr.write(msg);
    else out(msg);
}

const readSession = (): {
    port: number;
    pid: number;
    extId: string;
    profileDir: string;
} | null => {
    if (!existsSync(STATE_FILE)) return null;
    try {
        return JSON.parse(readFileSync(STATE_FILE, "utf8")) as {
            port: number;
            pid: number;
            extId: string;
            profileDir: string;
        };
    } catch {
        return null;
    }
};

interface VerifyPageSummary {
    url?: string;
    dir?: string;
    heading?: string | null;
    hasErrorBoundary?: boolean;
}

interface VerifyDbSummary {
    siteUsageDays?: number;
    videoMetaCount?: number;
    totalBytes?: number;
    todayUsage?: Record<string, number>;
    todayWatchHistory?: Record<string, number>;
}

interface VerifyResponse {
    ok?: boolean;
    error?: string;
    pid?: number;
    surface?: string;
    ready?: boolean;
    issueCount?: number;
    issues?: RuntimeIssue[];
    newIssues?: RuntimeIssue[];
    page?: VerifyPageSummary;
    aria?: string;
    suggestedFilename?: string;
    bytes?: number;
    path?: string;
    badge?: { text?: string; color?: unknown };
    db?: VerifyDbSummary;
    storageSync?: unknown;
    storageLocal?: unknown;
    report?: unknown;
}

function report(data: VerifyResponse): number {
    const errs = data.newIssues ?? [];
    for (const e of errs) out(`  [✗] ${e.source}/${e.level}: ${e.message}`);
    if (data.ready === false)
        out("  [✗] UI did not settle (blank page or persistent loading state)");
    if (data.page?.hasErrorBoundary) out("  [✗] Error boundary rendered");
    return errs.length > 0 || data.ready === false || data.page?.hasErrorBoundary ? 1 : 0;
}

async function call(endpoint: string, payload?: Record<string, unknown>): Promise<VerifyResponse> {
    const s = readSession();
    if (!s) {
        out('INCONCLUSIVE: No active session. Run "bun run verify start" first.');
        process.exit(2);
    }
    try {
        const res = await fetch(`http://127.0.0.1:${s.port}${endpoint}`, {
            method: payload ? "POST" : "GET",
            headers: payload ? { "content-type": "application/json" } : undefined,
            body: payload ? JSON.stringify(payload) : undefined,
        });
        const data = (await res.json()) as VerifyResponse;
        if (!res.ok || data.ok === false) {
            out(`FAIL: ${data.error ?? `HTTP ${res.status}`}`);
            process.exit(1);
        }
        return data;
    } catch (err) {
        out(
            `INCONCLUSIVE: Session unreachable (${err instanceof Error ? err.message : String(err)}). Run "stop" then "start".`,
        );
        process.exit(2);
    }
}

function parsePositiveInt(raw: string | undefined, fallback: number, flagName: string): number {
    if (raw === undefined) return fallback;
    const n = Number(raw);
    if (!Number.isInteger(n) || n <= 0) {
        throw new Error(`${flagName} must be a positive integer (got "${raw}").`);
    }
    return n;
}

function parseNonNegativeInt(raw: string | undefined, flagName: string): number | undefined {
    if (raw === undefined) return undefined;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
        throw new Error(`${flagName} must be a non-negative integer (got "${raw}").`);
    }
    return n;
}

async function runDoctor(timeoutMs: number): Promise<number> {
    const chrome = findChromiumExecutable();
    const manifestPath = join(EXT_DIR, "manifest.json");
    out(`TubeSize Verify Doctor`);
    out(`  [✓] bun       v${Bun.version}`);
    if (!chrome) {
        out("  [✗] chromium  Not found (set CHROME_PATH or install Playwright Chromium)");
        return 2;
    }
    out(`  [✓] chromium  ${chrome}`);
    if (!existsSync(manifestPath)) {
        out('  [✗] build     Missing .output/chrome-mv3/manifest.json — run "bun run build"');
        return 2;
    }
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        version?: string;
        manifest_version?: number;
    };
    const stale = getLatestMtimeMs(join(ROOT, "src")) > getLatestMtimeMs(EXT_DIR);
    out(
        `  [${stale ? "!" : "✓"}] build     MV${manifest.manifest_version ?? "?"} v${manifest.version ?? "?"} (${stale ? "STALE — run bun run build" : "fresh"})`,
    );

    let closeBrowser: (() => Promise<void>) | null = null;
    let interrupted = false;
    const onSignal = (sig: NodeJS.Signals) => {
        interrupted = true;
        void (closeBrowser ? closeBrowser() : Promise.resolve()).finally(() => {
            process.exit(sig === "SIGINT" ? 130 : 143);
        });
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
        const browser = await launchExtension(EXT_DIR, timeoutMs);
        closeBrowser = browser.close;
        if (interrupted) {
            await browser.close();
            return 130;
        }
        try {
            await browser.page.goto(`chrome-extension://${browser.extId}/popup.html#/`, {
                waitUntil: "domcontentloaded",
            });
            const ready = await waitForSettle(browser.page, 4000);
            const summary = await readPageSummary(browser.page);
            if (browser.issues.length > 0 || summary.hasErrorBoundary || !ready) {
                out(
                    `  [✗] boot      ${browser.issues.map((i) => i.message).join("; ") || (summary.hasErrorBoundary ? "Error boundary rendered" : "Popup never settled (blank or loading)")}`,
                );
                return 1;
            }
            if (stale) {
                out("  [!] build is STALE — rebuild before verifying (bun run build)");
                return 2;
            }
            out(`  [✓] boot      MV3 worker online & popup clean (id: ${browser.extId})`);
            return 0;
        } finally {
            await browser.close();
        }
    } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
    }
}

async function runStop(quiet = false): Promise<number> {
    const s = readSession();
    if (!s) {
        if (!quiet) out("No active session.");
        return 0;
    }
    try {
        await fetch(`http://127.0.0.1:${s.port}/stop`, { method: "POST" });
    } catch {
        try {
            process.kill(s.pid, "SIGTERM");
        } catch {
            // Process already exited.
        }
    }
    const isAlive = () => {
        try {
            process.kill(s.pid, 0);
            return true;
        } catch {
            return false;
        }
    };
    const deadline = Date.now() + 10_000;
    while (isAlive() && Date.now() < deadline) await Bun.sleep(100);
    if (isAlive()) {
        try {
            process.kill(s.pid, "SIGKILL");
        } catch {
            // Process exited before SIGKILL.
        }
        await Bun.sleep(200);
    }
    if (readSession()?.pid === s.pid) rmSync(STATE_FILE, { force: true });
    if (s.profileDir.includes("ts-verify-") && existsSync(s.profileDir))
        rmSync(s.profileDir, { recursive: true, force: true });
    if (!quiet) out(`Stopped session (pid ${s.pid}).`);
    return 0;
}

async function main(): Promise<number> {
    const [cmd, ...rest] = process.argv.slice(2);
    if (!cmd || cmd === "-h" || cmd === "--help" || cmd === "help") {
        out(HELP);
        return 0;
    }

    const { values, positionals, tokens } = parseArgs({
        args: rest,
        allowPositionals: true,
        tokens: true,
        strict: true,
        options: {
            build: { type: "boolean", default: false },
            seed: { type: "string", default: "full" },
            lang: { type: "string", default: "en" },
            target: { type: "string", default: "daily" },
            "prev-version": { type: "string" },
            runs: { type: "string" },
            cached: { type: "boolean", default: false },
            save: { type: "string" },
            timeout: { type: "string" },
            ms: { type: "string" },
            gone: { type: "boolean", default: false },
            json: { type: "boolean", default: false },
            quiet: { type: "boolean", short: "q", default: false },
            exact: { type: "boolean", default: false },
            nth: { type: "string" },
            repeat: { type: "string" },
            role: { type: "string" },
            name: { type: "string" },
            label: { type: "string" },
            text: { type: "string" },
            selector: { type: "string" },
            value: { type: "string" },
            help: { type: "boolean", short: "h", default: false },
        },
    });
    if (values.help) {
        out(HELP);
        return 0;
    }

    const locatorPayload = () => ({
        role: values.role,
        name: values.name,
        label: values.label,
        text: values.text,
        selector: values.selector,
        exact: values.exact,
        nth: parseNonNegativeInt(values.nth, "--nth"),
    });

    switch (cmd) {
        case "doctor":
            return await runDoctor(parsePositiveInt(values.timeout, 30_000, "--timeout"));

        case "start": {
            const startTimeoutMs = parsePositiveInt(values.timeout, 40_000, "--timeout");
            if (values.build) {
                const b = Bun.spawnSync({
                    cmd: ["bun", "run", "build"],
                    cwd: ROOT,
                    stdout: "inherit",
                    stderr: "inherit",
                });
                if (b.exitCode !== 0) return 1;
            } else if (!existsSync(join(EXT_DIR, "manifest.json"))) {
                out(
                    'INCONCLUSIVE: Missing .output/chrome-mv3. Run "bun run build" or pass --build.',
                );
                return 2;
            }
            if (!findChromiumExecutable()) {
                out("INCONCLUSIVE: Chromium not found.");
                return 2;
            }
            await runStop(true);
            mkdirSync(EVIDENCE_DIR, { recursive: true });
            const fd = openSync(LOG_FILE, "w");
            const serverArgs = [
                SERVER_PATH,
                "--ext-dir",
                EXT_DIR,
                "--state-file",
                STATE_FILE,
                "--seed",
                values.seed,
                "--lang",
                values.lang,
                "--target",
                values.target,
                "--timeout",
                String(startTimeoutMs),
                ...(values["prev-version"] ? ["--prev-version", values["prev-version"]] : []),
            ];
            const child = spawn(process.execPath, serverArgs, {
                cwd: ROOT,
                detached: true,
                stdio: ["ignore", fd, fd],
            });
            child.unref();
            closeSync(fd);

            const deadline = Date.now() + startTimeoutMs;
            while (Date.now() < deadline) {
                const s = readSession();
                if (s) {
                    const res = await fetch(`http://127.0.0.1:${s.port}/health`).catch(() => null);
                    if (res?.ok) {
                        const data = (await res.json()) as VerifyResponse;
                        const failed =
                            (data.issueCount ?? 0) > 0 ||
                            data.ready === false ||
                            data.page?.hasErrorBoundary;
                        out(
                            `Session ${failed ? "STARTED WITH ERRORS" : "READY"} (pid ${s.pid}, ext ${s.extId}) → ${data.page?.url} (dir=${data.page?.dir}, errors=${data.issueCount}, ready=${data.ready})`,
                        );
                        if (failed) out('  Run "bun run verify state" for details.');
                        return failed ? 1 : 0;
                    }
                }
                await Bun.sleep(150);
            }
            out(
                `FAIL: Session timed out.\n${existsSync(LOG_FILE) ? readFileSync(LOG_FILE, "utf8").slice(-600) : ""}`,
            );
            return 1;
        }

        case "stop":
            return await runStop();

        case "status": {
            const data = await call("/health");
            out(
                `RUNNING (pid ${data.pid}, surface=${data.surface}) → ${data.page?.url} (dir=${data.page?.dir}, errors=${data.issueCount})`,
            );
            return 0;
        }

        case "goto": {
            const target = positionals[0];
            if (!target) {
                out("Usage: bun run verify goto <target>");
                return 1;
            }
            const data = await call("/goto", { target });
            out(
                `→ ${data.page?.url} (dir=${data.page?.dir}, newErrors=${(data.newIssues as RuntimeIssue[]).length})`,
            );
            return report(data);
        }

        case "popup": {
            const action = positionals[0] ?? "open";
            if (action !== "open" && action !== "close") {
                out("Usage: bun run verify popup [open|close]");
                return 1;
            }
            const data = await call("/popup", { action });
            out(
                `Popup ${action} (${data.surface}) → ${data.page?.url} (dir=${data.page?.dir}, newErrors=${(data.newIssues as RuntimeIssue[]).length})`,
            );
            return report(data);
        }

        case "snapshot": {
            const data = await call("/snapshot", { selector: values.selector });
            const aria = data.aria ?? "";
            if (positionals[0]) {
                const dest = resolve(positionals[0]);
                mkdirSync(dirname(dest), { recursive: true });
                const content = `${aria}\n`;
                writeFileSync(dest, content);
                const lines = aria ? aria.split("\n").length : 0;
                const bytes = Buffer.byteLength(content, "utf8");
                out(`# Saved → ${relative(ROOT, dest)} (${lines} lines, ${bytes} B)`);
                if (values.quiet) return 0;
            }
            const scope = values.selector ? ` selector=${values.selector}` : "";
            out(
                `# ${data.page?.url} (surface=${data.surface}, dir=${data.page?.dir}${scope})\n${aria}`,
            );
            return 0;
        }

        case "click":
        case "hover":
        case "fill": {
            if (cmd === "fill" && values.value === undefined) {
                out("Usage: bun run verify fill --value <text> [--role/--name|--label|--selector]");
                return 1;
            }
            const data = await call(`/${cmd}`, {
                ...locatorPayload(),
                value: values.value,
            });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            const verb = cmd === "click" ? "Clicked" : cmd === "hover" ? "Hovered" : "Filled";
            out(
                `${verb} → ${data.page?.url} (surface=${data.surface}, dir=${data.page?.dir}, newErrors=${errs.length})`,
            );
            return report(data);
        }

        case "press": {
            if (!positionals[0]) {
                out("Usage: bun run verify press <key> [--repeat <n>]");
                return 1;
            }
            const repeat = parsePositiveInt(values.repeat, 1, "--repeat");
            const data = await call("/press", { key: positionals[0], repeat });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(
                `Pressed ${positionals[0]}${repeat > 1 ? ` x${repeat}` : ""} → ${data.page?.url} (newErrors=${errs.length})`,
            );
            return report(data);
        }

        case "wait": {
            const ms = parseNonNegativeInt(values.ms, "--ms");
            const timeoutMs = values.timeout
                ? parsePositiveInt(values.timeout, 10_000, "--timeout")
                : undefined;
            const data = await call("/wait", {
                ms,
                gone: values.gone,
                timeoutMs,
                ...locatorPayload(),
            });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(`Waited → ${data.page?.url} (surface=${data.surface}, newErrors=${errs.length})`);
            return report(data);
        }

        case "upload": {
            if (!positionals[0]) {
                out(
                    "Usage: bun run verify upload <file> [--role/--name|--label|--text|--selector]",
                );
                return 1;
            }
            const absFile = resolve(positionals[0]);
            if (!existsSync(absFile)) {
                out(`FAIL: File not found: ${absFile}`);
                return 1;
            }
            const data = await call("/upload", {
                file: absFile,
                ...locatorPayload(),
            });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(
                `Uploaded ${relative(ROOT, absFile)} → ${data.page?.url} (dir=${data.page?.dir}, newErrors=${errs.length})`,
            );
            return report(data);
        }

        case "download": {
            const dest = positionals[0] ? resolve(positionals[0]) : undefined;
            const data = await call("/download", {
                path: dest,
                outDir: EVIDENCE_DIR,
                ...locatorPayload(),
            });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(
                `Downloaded ${data.suggestedFilename ?? ""} (${String(data.bytes ?? 0)} B) → ${relative(ROOT, data.path ?? "")} (newErrors=${errs.length})`,
            );
            return report(data);
        }

        case "reload": {
            const data = await call("/reload", {});
            out(
                `Reloaded → ${data.page?.url} (dir=${data.page?.dir}, newErrors=${(data.newIssues as RuntimeIssue[]).length})`,
            );
            return report(data);
        }

        case "seed": {
            const mode =
                positionals[0] === "empty"
                    ? "empty"
                    : positionals[0] === "heavy"
                      ? "heavy"
                      : "full";
            const data = await call("/seed", {
                mode,
                lang: tokens.some((t) => t.kind === "option" && t.name === "lang")
                    ? values.lang
                    : undefined,
            });
            out(
                `Seeded (${mode}): ${data.db?.siteUsageDays} days, ${data.db?.videoMetaCount} videos → ${data.page?.url}`,
            );
            return report(data);
        }

        case "perf": {
            const sub = positionals[0] ?? "all";
            const runs = parsePositiveInt(values.runs, 3, "--runs");
            const hasTarget = tokens.some((t) => t.kind === "option" && t.name === "target");
            const hasSeed = tokens.some((t) => t.kind === "option" && t.name === "seed");

            if (sub === "bundle") {
                const bundleReport = measureBundle(ROOT);
                if (!bundleReport.chrome && !bundleReport.firefox) {
                    out('INCONCLUSIVE: No build found under .output/. Run "bun run build" first.');
                    return 2;
                }
                if (values.json) out(JSON.stringify(bundleReport, null, 2));
                else printBundlePerf(bundleReport);
                maybeSaveJson(values.save, bundleReport, values.json);
                return 0;
            }

            if (sub === "popup") {
                const target = hasTarget ? values.target : "fixture:youtube-vod";
                const data = await call("/perf/popup", {
                    target,
                    runs,
                    cached: values.cached,
                });
                const perfReport = data.report as PopupPerfReport;
                if (values.json) out(JSON.stringify(perfReport, null, 2));
                else printPopupPerf(perfReport);
                maybeSaveJson(values.save, perfReport, values.json);
                return report(data);
            }

            if (sub === "dashboard") {
                const target = hasTarget ? values.target : "daily";
                const data = await call("/perf/dashboard", {
                    target,
                    runs,
                    seed: hasSeed ? values.seed : undefined,
                });
                const perfReport = data.report as DashboardPerfReport;
                if (values.json) out(JSON.stringify(perfReport, null, 2));
                else printDashboardPerf(perfReport);
                maybeSaveJson(values.save, perfReport, values.json);
                return report(data);
            }

            if (sub === "memory") {
                const data = await call("/perf/memory", {});
                const perfReport = data.report as MemoryPerfReport;
                if (values.json) out(JSON.stringify(perfReport, null, 2));
                else printMemoryPerf(perfReport);
                maybeSaveJson(values.save, perfReport, values.json);
                return report(data);
            }

            if (sub === "all") {
                const bundleReport = measureBundle(ROOT);
                const ytCold = await call("/perf/popup", {
                    target: "fixture:youtube-vod",
                    runs,
                    cached: false,
                });
                const ytWarm = await call("/perf/popup", {
                    target: "fixture:youtube-vod",
                    runs,
                    cached: true,
                });
                const twCold = await call("/perf/popup", {
                    target: "fixture:twitch-live",
                    runs,
                    cached: false,
                });
                const dashDaily = await call("/perf/dashboard", {
                    target: "daily",
                    runs,
                    seed: hasSeed ? values.seed : "full",
                });
                const dashSites = await call("/perf/dashboard", {
                    target: "sites",
                    runs,
                });
                const mem = await call("/perf/memory", {});

                const combined = {
                    bundle: bundleReport,
                    popup: {
                        youtubeVodUncached: ytCold.report as PopupPerfReport,
                        youtubeVodCached: ytWarm.report as PopupPerfReport,
                        twitchLiveUncached: twCold.report as PopupPerfReport,
                    },
                    dashboard: {
                        daily: dashDaily.report as DashboardPerfReport,
                        sites: dashSites.report as DashboardPerfReport,
                    },
                    memory: mem.report as MemoryPerfReport,
                };
                if (values.json) {
                    out(JSON.stringify(combined, null, 2));
                } else {
                    printBundlePerf(combined.bundle);
                    out("");
                    printPopupPerf(combined.popup.youtubeVodUncached);
                    out("");
                    printPopupPerf(combined.popup.youtubeVodCached);
                    out("");
                    printPopupPerf(combined.popup.twitchLiveUncached);
                    out("");
                    printDashboardPerf(combined.dashboard.daily);
                    out("");
                    printDashboardPerf(combined.dashboard.sites);
                    out("");
                    printMemoryPerf(combined.memory);
                }
                maybeSaveJson(values.save, combined, values.json);
                const allIssues = [ytCold, ytWarm, twCold, dashDaily, dashSites, mem].flatMap(
                    (r) => r.newIssues ?? [],
                );
                return report({ newIssues: allIssues });
            }

            out(`Unknown perf subcommand "${sub}". Use: bundle | popup | dashboard | memory | all`);
            return 1;
        }

        case "state": {
            const data = await call("/state", {});
            if (values.json) {
                out(JSON.stringify(data, null, 2));
                const errs = (data.issues as RuntimeIssue[]) ?? [];
                return errs.length > 0 || data.page?.hasErrorBoundary ? 1 : 0;
            }
            const errs = (data.issues as RuntimeIssue[]) ?? [];
            out(
                `URL:     ${data.page?.url}\nSurface: ${data.surface}\nDir:     ${data.page?.dir}  Heading: ${data.page?.heading ?? "(none)"}`,
            );
            if (data.badge) {
                const color = Array.isArray(data.badge.color)
                    ? `rgba(${data.badge.color.join(",")})`
                    : "";
                out(`Badge:   ${JSON.stringify(data.badge.text ?? "")} ${color}`.trimEnd());
            }
            if (data.db) {
                out(
                    `DB:      ${data.db.siteUsageDays} days, ${data.db.videoMetaCount} videos, ${formatSiBytes(data.db.totalBytes ?? 0)}`,
                );
                const todayUsage = data.db.todayUsage;
                if (todayUsage && Object.keys(todayUsage).length > 0) {
                    const summary = Object.entries(todayUsage)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ");
                    out(`Today:   ${summary}`);
                }
                const todayWatch = data.db.todayWatchHistory;
                if (todayWatch && Object.keys(todayWatch).length > 0) {
                    const summary = Object.entries(todayWatch)
                        .map(([k, v]) => `${k}=${v}`)
                        .join(", ");
                    out(`Watch:   ${summary}`);
                }
            }
            if (data.storageSync) out(`Sync:    ${JSON.stringify(data.storageSync)}`);
            if (data.storageLocal) out(`Local:   ${JSON.stringify(data.storageLocal)}`);
            out(`Errors:  ${errs.length}`);
            for (const e of errs) out(`  [✗] ${e.source}/${e.level}: ${e.message}`);
            return errs.length > 0 || data.page?.hasErrorBoundary ? 1 : 0;
        }

        case "screenshot": {
            const stamp = new Date()
                .toISOString()
                .replaceAll(":", "-")
                .replace(/\.\d+Z$/, "Z");
            const dest = positionals[0]
                ? resolve(positionals[0])
                : join(EVIDENCE_DIR, `${stamp}.png`);
            await call("/screenshot", { path: dest });
            out(`Screenshot → ${relative(ROOT, dest)}`);
            return 0;
        }

        default:
            out(`Unknown command "${cmd}".\n\n${HELP}`);
            return 1;
    }
}

main()
    .then((c) => process.exit(c))
    .catch((err) => {
        process.stderr.write(`verify error: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
    });
