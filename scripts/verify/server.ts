import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseArgs } from "node:util";

import type { Locator, Page } from "playwright-core";

import { launchExtension, readPageSummary, resolveTargetUrl, waitForSettle } from "./browser";
import { applySeed, inspectDb, type SeedMode } from "./seed";

function locate(page: Page, q: Record<string, string | undefined>): Locator {
    if (q.selector) return page.locator(q.selector).first();
    if (q.role)
        return page
            .getByRole(
                q.role as Parameters<Page["getByRole"]>[0],
                q.name ? { name: q.name } : undefined,
            )
            .first();
    if (q.label) return page.getByLabel(q.label).first();
    if (q.text) return page.getByText(q.text).first();
    throw new Error("Specify --role [--name], --label, --text, or --selector.");
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
        },
    });

    const extDir = values["ext-dir"];
    const stateFile = values["state-file"];
    if (!extDir || !stateFile) throw new Error("Missing --ext-dir or --state-file.");

    const seed: SeedMode = values.seed === "empty" ? "empty" : "full";
    const lang: "en" | "ar" = values.lang === "ar" ? "ar" : "en";
    const browser = await launchExtension(extDir);
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
                    return Response.json({
                        ok: true,
                        aria: await page.locator("body").ariaSnapshot(),
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
                    const ready = await withNewTab(
                        () => page.keyboard.press(String(body.key)),
                        2000,
                    );
                    return Response.json({
                        ok: true,
                        ready,
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
