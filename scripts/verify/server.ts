import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { type Browser, type Locator, type Page } from "playwright-core";

import {
    launchExtension,
    openToolbarPopup,
    readPageSummary,
    resolveTargetUrl,
    waitForSettle,
} from "./browser";
import {
    handleUsageFixtureRequest,
    installPlatformRoutes,
    isFixtureTarget,
    resolveFixtureTarget,
    uninstallPlatformRoutes,
} from "./fixtures";
import { measureDashboardPerf, measureMemoryPerf, measurePopupPerf } from "./perf";
import { applySeed, inspectDb, type SeedMode } from "./seed";

function locate(page: Page, q: Record<string, unknown>): Locator {
    const exact = q.exact === true;
    const nth = typeof q.nth === "number" && Number.isInteger(q.nth) && q.nth >= 0 ? q.nth : 0;
    let base: Locator;
    if (typeof q.selector === "string" && q.selector) base = page.locator(q.selector);
    else if (typeof q.role === "string" && q.role)
        base = page.getByRole(
            q.role as Parameters<Page["getByRole"]>[0],
            typeof q.name === "string" ? { name: q.name, exact } : undefined,
        );
    else if (typeof q.label === "string" && q.label) base = page.getByLabel(q.label, { exact });
    else if (typeof q.text === "string" && q.text) base = page.getByText(q.text, { exact });
    else throw new Error("Specify --role [--name], --label, --text, or --selector.");
    return base.nth(nth);
}

function hasLocatorArg(q: Record<string, unknown>): boolean {
    return Boolean(
        (typeof q.selector === "string" && q.selector) ||
        (typeof q.role === "string" && q.role) ||
        (typeof q.label === "string" && q.label) ||
        (typeof q.text === "string" && q.text),
    );
}

async function main() {
    const { values } = parseArgs({
        args: process.argv.slice(2),
        strict: true,
        options: {
            "ext-dir": { type: "string" },
            "state-file": { type: "string" },
            seed: { type: "string", default: "full" },
            lang: { type: "string", default: "en" },
            target: { type: "string", default: "daily" },
            "prev-version": { type: "string" },
            timeout: { type: "string" },
        },
    });

    const extDir = values["ext-dir"];
    const stateFile = values["state-file"];
    if (!extDir || !stateFile) throw new Error("Missing --ext-dir or --state-file.");

    const seed: SeedMode =
        values.seed === "empty" ? "empty" : values.seed === "heavy" ? "heavy" : "full";
    const lang: "en" | "ar" = values.lang === "ar" ? "ar" : "en";
    const prevVersion = values["prev-version"];
    const parsedTimeout = values.timeout ? Number(values.timeout) : NaN;
    const launchTimeoutMs =
        Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30_000;
    const browser = await launchExtension(extDir, launchTimeoutMs, { enableCdp: true });
    const { extId, issues, context, serviceWorker, cdpPort } = browser;

    let mainPage: Page = browser.page;
    let popupState: { page: Page; cdpBrowser: Browser } | null = null;
    let platformRoutesInstalled = false;
    let initialReady = false;
    let lastActivity = Date.now();
    let stopping = false;

    const activePage = (): Page =>
        popupState && !popupState.page.isClosed() ? popupState.page : mainPage;

    const closePopup = async () => {
        if (!popupState) return;
        const current = popupState;
        popupState = null;
        if (!current.page.isClosed()) await current.page.close().catch(() => {});
        await current.cdpBrowser.close().catch(() => {});
    };

    const ensurePlatformRoutes = async () => {
        if (platformRoutesInstalled) return;
        platformRoutesInstalled = true;
        await installPlatformRoutes(context);
    };

    // Live navigations must reach the real site: fixture routes would otherwise keep serving
    // synthetic HTML from an earlier fixture visit for the rest of the session.
    const disablePlatformRoutes = async () => {
        if (!platformRoutesInstalled) return;
        platformRoutesInstalled = false;
        await uninstallPlatformRoutes(context);
    };

    const resolveTarget = async (raw: string, serverPort: number) => {
        if (isFixtureTarget(raw)) {
            if (raw !== "fixture:usage-site") await ensurePlatformRoutes();
            return resolveFixtureTarget(raw, serverPort);
        }
        await disablePlatformRoutes();
        return resolveTargetUrl(extId, raw);
    };

    /** Runs an action; if it opened a new tab, switch to it and wait for it to settle. */
    const withNewTab = async (action: () => Promise<unknown>, settleMs: number) => {
        const known = new Set(context.pages());
        await action();
        await mainPage.waitForTimeout(200);
        const opened = context.pages().filter((p) => !known.has(p) && !p.isClosed());
        if (opened.length > 0) {
            await closePopup();
            mainPage = opened.at(-1)!;
            await mainPage.waitForLoadState("domcontentloaded").catch(() => {});
            await mainPage.bringToFront().catch(() => {});
        } else if (popupState?.page.isClosed()) {
            await closePopup();
        }
        return await waitForSettle(activePage(), settleMs);
    };

    let serverPort = 0;

    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(req) {
            const fixtureRes = handleUsageFixtureRequest(req);
            if (fixtureRes) return fixtureRes;

            lastActivity = Date.now();
            const path = new URL(req.url).pathname;
            const body =
                req.method === "POST"
                    ? ((await req.json().catch(() => ({}))) as Record<string, any>)
                    : {};

            try {
                if (path === "/health") {
                    const page = activePage();
                    return Response.json({
                        ok: true,
                        pid: process.pid,
                        extId,
                        surface: popupState ? "popup" : "tab",
                        issueCount: issues.length,
                        ready: initialReady,
                        page: await readPageSummary(page),
                    });
                }
                if (path === "/stop") {
                    setTimeout(() => void shutdown(), 40);
                    return Response.json({ ok: true });
                }
                if (path === "/goto") {
                    const before = issues.length;
                    await closePopup();
                    const next = await resolveTarget(String(body.target), serverPort);
                    if (next.viewport) await mainPage.setViewportSize(next.viewport);
                    await mainPage.goto(next.url, { waitUntil: "domcontentloaded" });
                    const ready = await waitForSettle(mainPage);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: "tab",
                        page: await readPageSummary(mainPage),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/popup") {
                    const action = body.action === "close" ? "close" : "open";
                    if (action === "close") {
                        await closePopup();
                        return Response.json({
                            ok: true,
                            ready: true,
                            surface: "tab",
                            page: await readPageSummary(mainPage),
                            newIssues: [],
                        });
                    }

                    const before = issues.length;
                    await closePopup();
                    if (!cdpPort) throw new Error("CDP is required to open the extension popup.");
                    const opened = await openToolbarPopup({
                        mainPage,
                        serviceWorker,
                        cdpPort,
                        extId,
                        issues,
                        timeoutMs: 4000,
                    });
                    popupState = { page: opened.popupPage, cdpBrowser: opened.cdpBrowser };
                    const ready = await waitForSettle(opened.popupPage, 6000);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: "popup",
                        page: await readPageSummary(opened.popupPage),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/reload") {
                    const before = issues.length;
                    const page = activePage();
                    await page.reload({ waitUntil: "domcontentloaded" });
                    const ready = await waitForSettle(page);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/snapshot") {
                    const page = activePage();
                    const target =
                        typeof body.selector === "string" && body.selector
                            ? page.locator(body.selector).first()
                            : page.locator("body");
                    return Response.json({
                        ok: true,
                        surface: popupState ? "popup" : "tab",
                        aria: await target.ariaSnapshot(),
                        page: await readPageSummary(page),
                        issues,
                    });
                }
                if (path === "/click") {
                    const before = issues.length;
                    const page = activePage();
                    const ready = await withNewTab(
                        () => locate(page, body).click({ timeout: 5000 }),
                        3000,
                    );
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(activePage()),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/hover") {
                    const before = issues.length;
                    const page = activePage();
                    await locate(page, body).hover({ timeout: 5000 });
                    await page.waitForTimeout(350);
                    const ready = await waitForSettle(page, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/fill") {
                    const before = issues.length;
                    const page = activePage();
                    await locate(page, body).fill(String(body.value ?? ""), {
                        timeout: 5000,
                    });
                    const ready = await waitForSettle(page, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/press") {
                    const before = issues.length;
                    const page = activePage();
                    const repeat =
                        typeof body.repeat === "number" &&
                        Number.isInteger(body.repeat) &&
                        body.repeat > 0
                            ? body.repeat
                            : 1;
                    const key = String(body.key);
                    const ready = await withNewTab(async () => {
                        for (let i = 0; i < repeat; i++) await page.keyboard.press(key);
                    }, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(activePage()),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/wait") {
                    const before = issues.length;
                    const page = activePage();
                    const ms =
                        typeof body.ms === "number" && Number.isFinite(body.ms) && body.ms > 0
                            ? Math.min(body.ms, 15_000)
                            : 0;
                    if (ms > 0) await Bun.sleep(ms);
                    if (hasLocatorArg(body)) {
                        const waitTimeout =
                            typeof body.timeoutMs === "number" && body.timeoutMs > 0
                                ? body.timeoutMs
                                : 10_000;
                        await locate(page, body).waitFor({
                            state: body.gone === true ? "hidden" : "visible",
                            timeout: waitTimeout,
                        });
                    }
                    const ready = await waitForSettle(page, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/upload") {
                    const before = issues.length;
                    const page = activePage();
                    const filePath = resolve(String(body.file ?? ""));
                    if (!existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
                    const [chooser] = await Promise.all([
                        page.waitForEvent("filechooser", { timeout: 5000 }),
                        locate(page, body).click({ timeout: 5000 }),
                    ]);
                    await chooser.setFiles(filePath);
                    await page.waitForTimeout(250);
                    const ready = await waitForSettle(page, 3000);
                    return Response.json({
                        ok: true,
                        ready,
                        file: filePath,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/download") {
                    const before = issues.length;
                    const page = activePage();
                    const [dl] = await Promise.all([
                        page.waitForEvent("download", { timeout: 5000 }),
                        locate(page, body).click({ timeout: 5000 }),
                    ]);
                    const suggestedFilename = dl.suggestedFilename();
                    const dest =
                        typeof body.path === "string" && body.path
                            ? resolve(body.path)
                            : join(resolve(String(body.outDir ?? ".")), suggestedFilename);
                    mkdirSync(dirname(dest), { recursive: true });
                    await dl.saveAs(dest);
                    const bytes = statSync(dest).size;
                    const ready = await waitForSettle(page, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        path: dest,
                        suggestedFilename,
                        bytes,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/screenshot") {
                    const page = activePage();
                    const dest = resolve(String(body.path));
                    mkdirSync(dirname(dest), { recursive: true });
                    await page.screenshot({ path: dest });
                    return Response.json({
                        ok: true,
                        path: dest,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                    });
                }
                if (path === "/seed") {
                    if (body.lang === "en" || body.lang === "ar") {
                        await serviceWorker.evaluate(
                            async (l: string) => await chrome.storage.sync.set({ language: l }),
                            body.lang,
                        );
                    }
                    const mode: SeedMode =
                        body.mode === "empty" ? "empty" : body.mode === "heavy" ? "heavy" : "full";
                    const db = await applySeed(serviceWorker, mode);
                    const before = issues.length;
                    const page = activePage();
                    if (page.url().startsWith(`chrome-extension://${extId}/`)) {
                        await page.reload({ waitUntil: "domcontentloaded" });
                    }
                    const ready = await waitForSettle(page);
                    return Response.json({
                        ok: true,
                        ready,
                        newIssues: issues.slice(before),
                        db,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                    });
                }
                if (path === "/perf/popup") {
                    const before = issues.length;
                    await closePopup();
                    const rawTarget =
                        typeof body.target === "string" && body.target
                            ? body.target
                            : "fixture:youtube-vod";
                    const runs =
                        typeof body.runs === "number" &&
                        Number.isInteger(body.runs) &&
                        body.runs > 0
                            ? Math.min(body.runs, 20)
                            : 3;
                    const resolved = await resolveTarget(rawTarget, serverPort);
                    const report = await measurePopupPerf({
                        target: rawTarget,
                        url: resolved.url,
                        viewport: resolved.viewport,
                        cached: body.cached === true,
                        runs,
                        mainPage,
                        serviceWorker,
                        cdpPort,
                        extId,
                        issues,
                    });
                    return Response.json({
                        ok: true,
                        report,
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/perf/dashboard") {
                    const before = issues.length;
                    await closePopup();
                    const rawTarget =
                        typeof body.target === "string" && body.target ? body.target : "daily";
                    const runs =
                        typeof body.runs === "number" &&
                        Number.isInteger(body.runs) &&
                        body.runs > 0
                            ? Math.min(body.runs, 20)
                            : 3;
                    const seedMode: SeedMode | null =
                        body.seed === "empty"
                            ? "empty"
                            : body.seed === "heavy"
                              ? "heavy"
                              : body.seed === "full"
                                ? "full"
                                : null;
                    if (seedMode) await applySeed(serviceWorker, seedMode);
                    const resolved = await resolveTarget(rawTarget, serverPort);
                    const report = await measureDashboardPerf({
                        target: rawTarget,
                        url: resolved.url,
                        viewport: resolved.viewport,
                        seed: seedMode,
                        runs,
                        mainPage,
                        serviceWorker,
                    });
                    return Response.json({
                        ok: true,
                        report,
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/perf/memory") {
                    const before = issues.length;
                    const report = await measureMemoryPerf({
                        activePage: activePage(),
                        surface: popupState ? "popup" : "tab",
                        serviceWorker,
                        cdpPort,
                        extId,
                        profileDir: browser.profileDir,
                    });
                    return Response.json({
                        ok: true,
                        report,
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/state") {
                    const page = activePage();
                    const [db, storageSync, storageLocal, badge] = await Promise.all([
                        inspectDb(serviceWorker),
                        serviceWorker.evaluate(async () => await chrome.storage.sync.get(null)),
                        serviceWorker.evaluate(async () => {
                            const all = await chrome.storage.local.get(null);
                            const mediaCacheKeys: string[] = [];
                            for (const key of Object.keys(all)) {
                                if (
                                    key.startsWith("youtube:") ||
                                    key.startsWith("twitch:") ||
                                    key.startsWith("kick:")
                                ) {
                                    mediaCacheKeys.push(key);
                                }
                            }
                            return {
                                lastSeenVersion: all.lastSeenVersion ?? null,
                                toasterSuppressedDate: all.toasterSuppressedDate ?? null,
                                codecSupport: all.codecSupport ?? null,
                                mediaCacheKeys: mediaCacheKeys.sort(),
                            };
                        }),
                        serviceWorker.evaluate(async () => ({
                            text: await chrome.action.getBadgeText({}),
                            color: await chrome.action.getBadgeBackgroundColor({}),
                        })),
                    ]);
                    return Response.json({
                        ok: true,
                        surface: popupState ? "popup" : "tab",
                        page: await readPageSummary(page),
                        db,
                        storageSync,
                        storageLocal,
                        badge,
                        issues,
                    });
                }
                return Response.json(
                    { ok: false, error: `Unknown endpoint ${path}` },
                    { status: 404 },
                );
            } catch (err) {
                return Response.json(
                    {
                        ok: false,
                        error: err instanceof Error ? err.message : String(err),
                        issues,
                    },
                    { status: 500 },
                );
            }
        },
    });

    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        clearInterval(idleTimer);
        await closePopup();
        try {
            await server.stop(true);
        } catch {}
        await browser.close();
        // Only remove the state file if it still belongs to this server (a newer one may own it).
        try {
            if (existsSync(stateFile)) {
                const owner = JSON.parse(readFileSync(stateFile, "utf8")) as {
                    pid?: number;
                };
                if (owner.pid === process.pid) rmSync(stateFile, { force: true });
            }
        } catch {}
        process.exit(0);
    };

    serverPort = server.port ?? 0;
    if (!serverPort) {
        await shutdown();
        throw new Error("Verify server failed to bind a local port.");
    }

    const idleTimer = setInterval(() => {
        if (Date.now() - lastActivity > 20 * 60_000) void shutdown();
    }, 30_000);
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());

    // Bootstrap language, optional prevVersion & seed via serviceWorker, then navigate to requested target.
    try {
        await serviceWorker.evaluate(
            async (opts: { lang: string; prevVersion?: string }) => {
                await chrome.storage.sync.set({ language: opts.lang });
                if (opts.prevVersion !== undefined) {
                    await chrome.storage.local.set({ lastSeenVersion: opts.prevVersion });
                }
            },
            { lang, prevVersion },
        );
        await applySeed(serviceWorker, seed);

        const init = await resolveTarget(values.target, serverPort);
        if (init.viewport) await mainPage.setViewportSize(init.viewport);
        if (init.url !== mainPage.url())
            await mainPage.goto(init.url, { waitUntil: "domcontentloaded" });
        else await mainPage.reload({ waitUntil: "domcontentloaded" });
        initialReady = await waitForSettle(mainPage);
    } catch (err) {
        await shutdown();
        throw err;
    }

    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(
        stateFile,
        JSON.stringify({
            port: server.port,
            pid: process.pid,
            extId,
            profileDir: browser.profileDir,
        }),
    );
}

main().catch((err) => {
    process.stderr.write(
        `verify server fatal: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
});
