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

const ROOT = resolve(import.meta.dir, "..");
const EXT_DIR = join(ROOT, ".output", "chrome-mv3");
const EVIDENCE_DIR = join(ROOT, ".verify-evidence");
const STATE_FILE = join(EVIDENCE_DIR, ".session.json");
const LOG_FILE = join(EVIDENCE_DIR, ".session.log");
const SERVER_PATH = join(import.meta.dir, "verify", "server.ts");

const HELP = `TubeSize Verification CLI (Playwright)

Usage: bun run verify <command> [options]

Commands:
  doctor                        Health check: Bun, Chromium, build freshness, MV3 boot
  start [opts]                  Launch isolated Playwright session (--target, --seed, --lang, --build)
  status                        Check active session URL, dir, and error count
  stop                          Close active session & delete temp profile (keeps .verify-evidence/)
  goto <target>                 Navigate (popup|settings|daily|sites|today|date:*|platform:*|site:*|URL)
  snapshot [file.aria.txt]      Print ARIA accessibility tree (roles & names)
  click [locator]               Click (--role <r> [--name <n>] | --label <l> | --text <t> | --selector <css>)
  fill --value <v> [locator]    Fill an input
  press <key>                   Press a keyboard key (Enter, Escape, Tab, ...)
  reload                        Reload current page and wait for UI settle
  seed <full|empty> [--lang]    Re-seed IndexedDB (and optional language) and reload
  state                         Inspect URL, dir, IndexedDB counts, chrome.storage.sync & errors
  screenshot [path.png]         Capture 2x PNG screenshot (default: .verify-evidence/<timestamp>.png)

Exit codes: 0 verified | 1 failed | 2 inconclusive (missing Chromium, build, or active session)
`;

const out = (s: string) => process.stdout.write(s.endsWith("\n") ? s : `${s}\n`);
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

/** Prints new runtime issues / readiness problems and returns the exit code (0 ok, 1 fail). */
function report(data: Record<string, any>): number {
    const errs = (data.newIssues as RuntimeIssue[] | undefined) ?? [];
    for (const e of errs) out(`  [✗] ${e.source}/${e.level}: ${e.message}`);
    if (data.ready === false)
        out("  [✗] UI did not settle (blank page or persistent loading state)");
    if (data.page?.hasErrorBoundary) out("  [✗] Error boundary rendered");
    return errs.length > 0 || data.ready === false || data.page?.hasErrorBoundary ? 1 : 0;
}

async function call(
    endpoint: string,
    payload?: Record<string, unknown>,
): Promise<Record<string, any>> {
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
        const data = (await res.json()) as Record<string, any>;
        if (!res.ok || data.ok === false) {
            out(`FAIL: ${String(data.error ?? `HTTP ${res.status}`)}`);
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

async function runDoctor(): Promise<number> {
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

    const browser = await launchExtension(EXT_DIR);
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
        } catch {}
    }
    // Wait for the old server to fully exit so it cannot touch a replacement session's state.
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
        } catch {}
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

    switch (cmd) {
        case "doctor":
            return await runDoctor();

        case "start": {
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
            const child = spawn(
                process.execPath,
                [
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
                ],
                { cwd: ROOT, detached: true, stdio: ["ignore", fd, fd] },
            );
            child.unref();
            closeSync(fd);

            const deadline = Date.now() + 20_000;
            while (Date.now() < deadline) {
                const s = readSession();
                if (s) {
                    const res = await fetch(`http://127.0.0.1:${s.port}/health`).catch(() => null);
                    if (res?.ok) {
                        const data = (await res.json()) as Record<string, any>;
                        const failed =
                            data.issueCount > 0 ||
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
                `RUNNING (pid ${data.pid}) → ${data.page?.url} (dir=${data.page?.dir}, errors=${data.issueCount})`,
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

        case "snapshot": {
            const data = await call("/snapshot", {});
            const aria = String(data.aria ?? "");
            if (positionals[0]) {
                const dest = resolve(positionals[0]);
                mkdirSync(dirname(dest), { recursive: true });
                writeFileSync(dest, `${aria}\n`);
                out(`# Saved → ${relative(ROOT, dest)}`);
            }
            out(`# ${data.page?.url} (dir=${data.page?.dir})\n${aria}`);
            return 0;
        }

        case "click":
        case "fill": {
            if (cmd === "fill" && values.value === undefined) {
                out("Usage: bun run verify fill --value <text> [--role/--name|--label|--selector]");
                return 1;
            }
            const data = await call(`/${cmd}`, {
                role: values.role,
                name: values.name,
                label: values.label,
                text: values.text,
                selector: values.selector,
                value: values.value,
            });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(
                `${cmd === "click" ? "Clicked" : "Filled"} → ${data.page?.url} (dir=${data.page?.dir}, newErrors=${errs.length})`,
            );
            return report(data);
        }

        case "press": {
            if (!positionals[0]) {
                out("Usage: bun run verify press <key>");
                return 1;
            }
            const data = await call("/press", { key: positionals[0] });
            const errs = (data.newIssues as RuntimeIssue[]) ?? [];
            out(`Pressed ${positionals[0]} → ${data.page?.url} (newErrors=${errs.length})`);
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
            const mode = positionals[0] === "empty" ? "empty" : "full";
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

        case "state": {
            const data = await call("/state", {});
            const errs = (data.issues as RuntimeIssue[]) ?? [];
            out(
                `URL:     ${data.page?.url}\nDir:     ${data.page?.dir}  Heading: ${data.page?.heading ?? "(none)"}`,
            );
            if (data.db)
                out(
                    `DB:      ${data.db.siteUsageDays} days, ${data.db.videoMetaCount} videos, ${(data.db.totalBytes / 1073741824).toFixed(2)} GB`,
                );
            if (data.storageSync) out(`Storage: ${JSON.stringify(data.storageSync)}`);
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
