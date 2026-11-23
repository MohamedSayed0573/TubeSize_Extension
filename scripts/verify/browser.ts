import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
    type Browser,
    type BrowserContext,
    chromium,
    type Page,
    type Worker,
} from "playwright-core";

export interface RuntimeIssue {
    source: "page" | "network";
    level: "error" | "exception";
    message: string;
}

export interface PageSummary {
    url: string;
    hash: string;
    dir: string;
    heading: string | null;
    textLength: number;
    hasErrorBoundary: boolean;
}

export function computeExtensionId(extDir: string): string {
    return createHash("sha256")
        .update(resolve(extDir))
        .digest("hex")
        .slice(0, 32)
        .split("")
        .map((c) => String.fromCharCode(c.charCodeAt(0) + (c >= "a" ? 10 : 49)))
        .join("");
}

export function findChromiumExecutable(): string | null {
    if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH))
        return process.env.CHROME_PATH;
    for (const cache of [
        join(homedir(), ".cache", "ms-playwright"),
        join(homedir(), "Library", "Caches", "ms-playwright"),
    ]) {
        if (!existsSync(cache)) continue;
        const dirs = readdirSync(cache)
            .filter((n) => /^chromium-\d+$/.test(n))
            .sort((a, b) => Number(b.slice(9)) - Number(a.slice(9)));
        for (const d of dirs) {
            for (const rel of [
                "chrome-linux64/chrome",
                "chrome-linux/chrome",
                "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
            ]) {
                const full = join(cache, d, rel);
                if (existsSync(full)) return full;
            }
        }
    }
    for (const bin of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
        const found = Bun.which(bin);
        if (found) return found;
    }
    return null;
}

export function getLatestMtimeMs(dir: string): number {
    if (!existsSync(dir)) return 0;
    let latest = 0;
    const stack = [dir];
    while (stack.length > 0) {
        const cur = stack.pop()!;
        const st = statSync(cur);
        if (st.isDirectory()) {
            for (const entry of readdirSync(cur)) stack.push(join(cur, entry));
        } else if (st.mtimeMs > latest) {
            latest = st.mtimeMs;
        }
    }
    return latest;
}

export function resolveTargetUrl(
    extId: string,
    raw: string,
): {
    url: string;
    viewport?: { width: number; height: number };
} {
    const today = new Intl.DateTimeFormat("en-CA").format(new Date());
    if (raw === "popup")
        return {
            url: `chrome-extension://${extId}/popup.html#/`,
            viewport: { width: 420, height: 600 },
        };
    if (raw === "settings")
        return {
            url: `chrome-extension://${extId}/popup.html#/settings`,
            viewport: { width: 420, height: 640 },
        };
    if (raw === "dashboard" || raw === "daily")
        return {
            url: `chrome-extension://${extId}/dashboard.html#/daily`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw === "sites" || raw === "week" || raw === "month" || raw === "lifetime")
        return {
            url: `chrome-extension://${extId}/dashboard.html#/${raw}`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw === "today")
        return {
            url: `chrome-extension://${extId}/dashboard.html#/${today}`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw.startsWith("date:"))
        return {
            url: `chrome-extension://${extId}/dashboard.html#/${raw.slice(5)}`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw.startsWith("platform:"))
        return {
            url: `chrome-extension://${extId}/dashboard.html#/platform/${raw.slice(9)}`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw.startsWith("site:"))
        return {
            url: `chrome-extension://${extId}/dashboard.html#/site/${encodeURIComponent(raw.slice(5))}`,
            viewport: { width: 1280, height: 800 },
        };
    if (raw.startsWith("#/")) return { url: `chrome-extension://${extId}/dashboard.html${raw}` };
    if (/^(chrome-extension|https?):\/\//.test(raw)) return { url: raw };
    return { url: `chrome-extension://${extId}/${raw.replace(/^\/+/, "")}` };
}

/** Waits for the UI to render. Returns false if the page stayed blank or kept loading. */
export async function waitForSettle(page: Page, timeoutMs = 6000): Promise<boolean> {
    const ready = await page
        .waitForFunction(
            () => {
                const root = document.getElementById("root") ?? document.body;
                return (
                    root.innerText.trim().length > 0 &&
                    !root.querySelector('[data-slot="skeleton"], .animate-spin')
                );
            },
            undefined,
            { timeout: timeoutMs },
        )
        .then(() => true)
        .catch(() => false);
    await page
        .evaluate(async () => {
            if (document.fonts?.ready) await document.fonts.ready;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        })
        .catch(() => {});
    await page.waitForTimeout(200);
    return ready;
}

export async function readPageSummary(page: Page): Promise<PageSummary> {
    return await page.evaluate(() => {
        const root = document.getElementById("root") ?? document.body;
        const text = (root?.innerText || "").trim();
        const hasErrorBoundary =
            text.includes("⚠") &&
            (text.includes("Something went wrong") ||
                text.includes("حدث خطأ") ||
                root?.querySelector(".border-red-900, .border-red-400") !== null);
        return {
            url: location.href,
            hash: location.hash,
            dir: document.documentElement.dir || "ltr",
            heading: root?.querySelector("h1, h2, h3")?.textContent?.trim() ?? null,
            textLength: text.length,
            hasErrorBoundary,
        };
    });
}

async function getFreePort(): Promise<number> {
    return await new Promise((res, rej) => {
        const srv = createServer();
        srv.once("error", rej);
        srv.listen(0, "127.0.0.1", () => {
            const addr = srv.address();
            const port = typeof addr === "object" && addr ? addr.port : 0;
            srv.close((err) => (err ? rej(err) : res(port)));
        });
    });
}

const attachedPages = new WeakSet<Page>();

export function attachPageListeners(p: Page, extId: string, issues: RuntimeIssue[]): void {
    if (attachedPages.has(p)) return;
    attachedPages.add(p);

    p.on("pageerror", (err) =>
        issues.push({
            source: "page",
            level: "exception",
            message: err.stack ?? err.message,
        }),
    );
    p.on("console", (m) => {
        if (m.type() === "error")
            issues.push({ source: "page", level: "error", message: m.text() });
    });
    p.on("requestfailed", (req) => {
        const err = req.failure()?.errorText ?? "unknown";
        if (req.url().startsWith(`chrome-extension://${extId}/`) && err !== "net::ERR_ABORTED") {
            issues.push({
                source: "network",
                level: "error",
                message: `${req.url()}: ${err}`,
            });
        }
    });
}

/**
 * Opens the toolbar popup via chrome.action.openPopup() and returns the page it created.
 * The popup lives in a browser window Playwright's persistent context does not attach to, so it
 * is discovered over a second CDP connection. Matching is by CDP target id: a regular popup.html
 * tab (e.g. `start --target popup`) shares the URL and must not be mistaken for the toolbar popup.
 */
export async function openToolbarPopup(opts: {
    mainPage: Page;
    serviceWorker: Worker;
    cdpPort: number;
    extId: string;
    issues: RuntimeIssue[];
    timeoutMs?: number;
}): Promise<{ popupPage: Page; cdpBrowser: Browser; openToTargetMs: number; startedAt: number }> {
    const cdpUrl = `http://127.0.0.1:${opts.cdpPort}`;
    const existingTargetIds = await collectPageTargetIds(cdpUrl);

    await opts.mainPage.bringToFront();
    const startedAt = performance.now();
    await opts.serviceWorker.evaluate(async () => await chrome.action.openPopup());

    const popupUrlPrefix = `chrome-extension://${opts.extId}/popup.html`;
    const deadline = Date.now() + (opts.timeoutMs ?? 5000);
    while (Date.now() < deadline) {
        await Bun.sleep(50);
        const candidate = await chromium.connectOverCDP(cdpUrl);
        for (const page of candidate.contexts().flatMap((c) => c.pages())) {
            if (!page.url().startsWith(popupUrlPrefix)) continue;
            if (existingTargetIds.has(await readPageTargetId(page))) continue;
            attachPageListeners(page, opts.extId, opts.issues);
            return {
                popupPage: page,
                cdpBrowser: candidate,
                openToTargetMs: performance.now() - startedAt,
                startedAt,
            };
        }
        await candidate.close().catch(() => {});
    }
    throw new Error("Timed out waiting for extension popup target.");
}

/** Target ids of every open page, so a popup opened later can be told apart from them. */
async function collectPageTargetIds(cdpUrl: string): Promise<Set<string>> {
    const browser = await chromium.connectOverCDP(cdpUrl);
    try {
        const ids = await Promise.all(
            browser
                .contexts()
                .flatMap((c) => c.pages())
                .map(readPageTargetId),
        );
        return new Set(ids);
    } finally {
        await browser.close().catch(() => {});
    }
}

async function readPageTargetId(page: Page): Promise<string> {
    const session = await page.context().newCDPSession(page);
    try {
        const { targetInfo } = await session.send("Target.getTargetInfo");
        return targetInfo.targetId;
    } finally {
        await session.detach().catch(() => {});
    }
}

export async function launchExtension(
    extDir: string,
    timeoutMs = 30_000,
    options?: { enableCdp?: boolean },
): Promise<{
    extId: string;
    profileDir: string;
    context: BrowserContext;
    page: Page;
    serviceWorker: Worker;
    cdpPort?: number;
    issues: RuntimeIssue[];
    close: () => Promise<void>;
}> {
    const absExt = resolve(extDir);
    const chromePath = findChromiumExecutable();
    if (!chromePath)
        throw new Error("Chromium not found. Set CHROME_PATH or install Playwright Chromium.");

    const extId = computeExtensionId(absExt);
    // Avoid Linux 108-byte Unix socket path limit when TMPDIR is deeply nested.
    const safeTmp =
        process.platform !== "win32" && tmpdir().length > 40 && existsSync("/tmp")
            ? "/tmp"
            : tmpdir();
    const profileDir = mkdtempSync(join(safeTmp, "ts-verify-"));
    const cdpPort = options?.enableCdp ? await getFreePort() : undefined;

    const context = await chromium.launchPersistentContext(profileDir, {
        executablePath: chromePath,
        headless: false,
        args: [
            "--headless=new",
            ...(cdpPort ? [`--remote-debugging-port=${cdpPort}`] : []),
            `--disable-extensions-except=${absExt}`,
            `--load-extension=${absExt}`,
            "--no-first-run",
            "--no-default-browser-check",
            "--disable-gpu",
        ],
        env: { ...process.env, TMPDIR: safeTmp },
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        acceptDownloads: true,
    });

    let closed = false;
    const close = async () => {
        if (closed) return;
        closed = true;
        try {
            await context.close();
        } catch {}
        try {
            rmSync(profileDir, { recursive: true, force: true });
        } catch {}
    };

    try {
        const workerUrl = `chrome-extension://${extId}/background.js`;
        const serviceWorker =
            context.serviceWorkers().find((w) => w.url() === workerUrl) ??
            (await context.waitForEvent("serviceworker", {
                predicate: (w) => w.url() === workerUrl,
                timeout: timeoutMs,
            }));

        const issues: RuntimeIssue[] = [];
        // Track every tab (e.g. dashboard opened via chrome.tabs.create from the popup).
        for (const p of context.pages()) attachPageListeners(p, extId, issues);
        context.on("page", (p) => attachPageListeners(p, extId, issues));
        const page = context.pages()[0] ?? (await context.newPage());

        return { extId, profileDir, context, page, serviceWorker, cdpPort, issues, close };
    } catch (err) {
        await close();
        throw err;
    }
}
