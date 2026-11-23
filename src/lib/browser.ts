import { buildExtensionPagePath, type ExtensionPageTarget } from "@lib/routes";

/** Opens an extension page in a new tab using a typed route target. */
export function chromeNavigate(target: ExtensionPageTarget | undefined) {
    if (!target) return;
    void chrome.tabs.create({
        url: chrome.runtime.getURL(buildExtensionPagePath(target)),
    });
}

/**
 * True on Firefox builds.
 *
 * WXT inlines `import.meta.env.FIREFOX` at build time, so this is a
 * compile-time constant: the Chromium-only branches are stripped from
 * Firefox builds entirely.
 */
export function isFirefox(): boolean {
    return import.meta.env.FIREFOX;
}

export function faviconURL(u: string | undefined) {
    try {
        if (!u) return;
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", u);
        url.searchParams.set("size", "32");
        return url.href;
    } catch {
        return;
    }
}

/**
 * Fallback for `faviconURL()` where `/_favicon/` is unavailable (Firefox).
 * Note: a direct website request, not a local lookup.
 */
export function originFaviconURL(origin: string | undefined) {
    try {
        if (!origin) return;
        const url = new URL("/favicon.ico", origin);
        if (url.protocol !== "http:" && url.protocol !== "https:") return;
        return url.href;
    } catch {
        return;
    }
}
