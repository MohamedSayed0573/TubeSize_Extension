import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { Locator, Page } from "playwright-core";

import { launchExtension, readPageSummary, resolveTargetUrl, waitForSettle } from "./browser";
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
            timeout: { type: "string" },
        },
    });

    const extDir = values["ext-dir"];
    const stateFile = values["state-file"];
    if (!extDir || !stateFile) throw new Error("Missing --ext-dir or --state-file.");

    const seed: SeedMode = values.seed === "empty" ? "empty" : "full";
    const lang: "en" | "ar" = values.lang === "ar" ? "ar" : "en";
    const parsedTimeout = values.timeout ? Number(values.timeout) : NaN;
    const launchTimeoutMs =
        Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 30_000;
    const browser = await launchExtension(extDir, launchTimeoutMs);
    const { extId, issues, context } = browser;
    let page: Page = browser.page;
    let initialReady = false;

    // Bootstrap language & seed on extension origin, then navigate to requested target.
    // Any failure here must still close Chromium and remove the temp profile.
    try {
        await page.goto(`chrome-extension://${extId}/dashboard.html#/daily`, {
            waitUntil: "domcontentloaded",
        });
        await page.evaluate(
            async (l: string) => await chrome.storage.sync.set({ language: l }),
            lang,
        );
        await applySeed(page, seed);

        const init = resolveTargetUrl(extId, values.target);
        if (init.viewport) await page.setViewportSize(init.viewport);
        if (init.url !== page.url()) await page.goto(init.url, { waitUntil: "domcontentloaded" });
        else await page.reload({ waitUntil: "domcontentloaded" });
        initialReady = await waitForSettle(page);
    } catch (err) {
        await browser.close();
        throw err;
    }

    /** Runs an action; if it opened a new tab, switch to it and wait for it to settle. */
    const withNewTab = async (action: () => Promise<unknown>, settleMs: number) => {
        const known = new Set(context.pages());
        await action();
        await page.waitForTimeout(150);
        const opened = context.pages().filter((p) => !known.has(p) && !p.isClosed());
        if (opened.length > 0) {
            page = opened.at(-1)!;
            await page.waitForLoadState("domcontentloaded").catch(() => {});
            await page.bringToFront().catch(() => {});
        }
        return await waitForSettle(page, settleMs);
    };

    let lastActivity = Date.now();
    let stopping = false;

    const shutdown = async () => {
        if (stopping) return;
        stopping = true;
        clearInterval(idleTimer);
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

    const idleTimer = setInterval(() => {
        if (Date.now() - lastActivity > 20 * 60_000) void shutdown();
    }, 30_000);
    process.once("SIGINT", () => void shutdown());
    process.once("SIGTERM", () => void shutdown());

    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(req) {
            lastActivity = Date.now();
            const path = new URL(req.url).pathname;
            const body =
                req.method === "POST"
                    ? ((await req.json().catch(() => ({}))) as Record<string, any>)
                    : {};

            try {
                if (path === "/health") {
                    return Response.json({
                        ok: true,
                        pid: process.pid,
                        extId,
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
                    const next = resolveTargetUrl(extId, String(body.target));
                    if (next.viewport) await page.setViewportSize(next.viewport);
                    await page.goto(next.url, { waitUntil: "domcontentloaded" });
                    const ready = await waitForSettle(page);
                    return Response.json({
                        ok: true,
                        ready,
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/reload") {
                    const before = issues.length;
                    await page.reload({ waitUntil: "domcontentloaded" });
                    const ready = await waitForSettle(page);
                    return Response.json({
                        ok: true,
                        ready,
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/snapshot") {
                    const target =
                        typeof body.selector === "string" && body.selector
                            ? page.locator(body.selector).first()
                            : page.locator("body");
                    return Response.json({
                        ok: true,
                        aria: await target.ariaSnapshot(),
                        page: await readPageSummary(page),
                        issues,
                    });
                }
                if (path === "/click") {
                    const before = issues.length;
                    const ready = await withNewTab(
                        () => locate(page, body).click({ timeout: 5000 }),
                        3000,
                    );
                    return Response.json({
                        ok: true,
                        ready,
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/fill") {
                    const before = issues.length;
                    await locate(page, body).fill(String(body.value ?? ""), {
                        timeout: 5000,
                    });
                    const ready = await waitForSettle(page, 2000);
                    return Response.json({
                        ok: true,
                        ready,
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/press") {
                    const before = issues.length;
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
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/upload") {
                    const before = issues.length;
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
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/download") {
                    const before = issues.length;
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
                        page: await readPageSummary(page),
                        newIssues: issues.slice(before),
                    });
                }
                if (path === "/screenshot") {
                    const dest = resolve(String(body.path));
                    mkdirSync(dirname(dest), { recursive: true });
                    await page.screenshot({ path: dest });
                    return Response.json({
                        ok: true,
                        path: dest,
                        page: await readPageSummary(page),
                    });
                }
                if (path === "/seed") {
                    if (!page.url().startsWith(`chrome-extension://${extId}/`)) {
                        throw new Error(
                            "seed must run on an extension page (goto popup|daily|settings first).",
                        );
                    }
                    if (body.lang === "en" || body.lang === "ar") {
                        await page.evaluate(
                            async (l: string) => await chrome.storage.sync.set({ language: l }),
                            body.lang,
                        );
                    }
                    const db = await applySeed(page, body.mode === "empty" ? "empty" : "full");
                    const before = issues.length;
                    await page.reload({ waitUntil: "domcontentloaded" });
                    const ready = await waitForSettle(page);
                    return Response.json({
                        ok: true,
                        ready,
                        newIssues: issues.slice(before),
                        db,
                        page: await readPageSummary(page),
                    });
                }
                if (path === "/state") {
                    const onExt = page.url().startsWith(`chrome-extension://${extId}/`);
                    return Response.json({
                        ok: true,
                        page: await readPageSummary(page),
                        db: onExt ? await inspectDb(page) : null,
                        storageSync: onExt
                            ? await page.evaluate(async () => await chrome.storage.sync.get(null))
                            : null,
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
