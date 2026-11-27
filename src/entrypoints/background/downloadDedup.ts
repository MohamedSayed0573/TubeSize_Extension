const CONTENT_DISPOSITION_HEADER = "content-disposition";
const ATTACHMENT_DISPOSITION_RE = /^\s*attachment(?:\s*;|\s*$)/i;
const DEFAULT_HOLD_MS = 500;
const DEFAULT_FINISHED_TTL_MS = 2_000;
const MAX_RECENT_FINISHED = 256;

type WebRequestCandidate = Pick<chrome.webRequest.OnCompletedDetails, "url" | "type" | "tabId">;

export interface DownloadDedupOptions {
    now?: () => number;
    holdMs?: number;
    finishedTtlMs?: number;
}

export interface DownloadDedup {
    track(downloadId: number, urls: ReadonlyArray<string | undefined>): void;
    finish(downloadId: number, urls?: ReadonlyArray<string | undefined>): void;
    remove(downloadId: number): void;
    interceptWebRequest(details: WebRequestCandidate, tabUrl: string, bytes: number): boolean;
    flushHeld(tabId?: number): void;
    dispose(): void;
}

interface HeldRequest {
    url: string;
    tabId: number;
    tabUrl: string;
    bytes: number;
    timer: ReturnType<typeof setTimeout>;
}

export function collectUrls(urls: ReadonlyArray<string | undefined>): string[] {
    const out: string[] = [];
    for (const url of urls) {
        if (typeof url === "string" && url.length > 0 && !out.includes(url)) {
            out.push(url);
        }
    }
    return out;
}

export function isAttachmentNavigation(
    details: Pick<chrome.webRequest.OnCompletedDetails, "type" | "responseHeaders">,
): boolean {
    if (details.type !== "main_frame" && details.type !== "sub_frame") return false;
    return (
        details.responseHeaders?.some(
            (candidate) =>
                candidate.name.toLowerCase() === CONTENT_DISPOSITION_HEADER &&
                typeof candidate.value === "string" &&
                ATTACHMENT_DISPOSITION_RE.test(candidate.value),
        ) ?? false
    );
}

function isCandidateType(type: WebRequestCandidate["type"]): boolean {
    return type === "main_frame" || type === "sub_frame" || type === "other";
}

export function createDownloadDedup(
    onRelease: (tabUrl: string, bytes: number) => void,
    options: DownloadDedupOptions = {},
): DownloadDedup {
    const now = options.now ?? Date.now;
    const holdMs = options.holdMs ?? DEFAULT_HOLD_MS;
    const finishedTtlMs = options.finishedTtlMs ?? DEFAULT_FINISHED_TTL_MS;

    const activeUrls = new Map<number, Set<string>>();
    const recentlyFinished = new Map<string, number>();
    const held: HeldRequest[] = [];
    let isDisposed = false;

    function pruneFinished(currentTime: number) {
        for (const [url, expiresAt] of recentlyFinished) {
            if (expiresAt <= currentTime) recentlyFinished.delete(url);
        }
    }

    function cancelHeldMatching(urls: ReadonlyArray<string>): boolean {
        if (urls.length === 0 || held.length === 0) return false;
        let cancelled = false;
        for (let i = held.length - 1; i >= 0; i -= 1) {
            const entry = held[i]!;
            if (!urls.includes(entry.url)) continue;
            clearTimeout(entry.timer);
            held.splice(i, 1);
            cancelled = true;
        }
        return cancelled;
    }

    function hasActiveUrl(url: string): boolean {
        for (const urls of activeUrls.values()) {
            if (urls.has(url)) return true;
        }
        return false;
    }

    function track(downloadId: number, urls: ReadonlyArray<string | undefined>) {
        if (isDisposed) return;
        const cleanUrls = collectUrls(urls);
        if (cleanUrls.length === 0) return;

        let entry = activeUrls.get(downloadId);
        if (!entry) {
            entry = new Set<string>();
            activeUrls.set(downloadId, entry);
        }
        for (const url of cleanUrls) entry.add(url);
        cancelHeldMatching(cleanUrls);
    }

    function finish(downloadId: number, urls: ReadonlyArray<string | undefined> = []) {
        const active = activeUrls.get(downloadId);
        activeUrls.delete(downloadId);
        if (isDisposed) return;

        const allUrls = collectUrls([...(active ?? []), ...urls]);
        if (allUrls.length === 0) return;

        const cancelled = cancelHeldMatching(allUrls);
        if (cancelled) return;

        const currentTime = now();
        pruneFinished(currentTime);
        const expiresAt = currentTime + finishedTtlMs;
        for (const url of allUrls) {
            recentlyFinished.delete(url);
            recentlyFinished.set(url, expiresAt);
        }
        while (recentlyFinished.size > MAX_RECENT_FINISHED) {
            const oldest = recentlyFinished.keys().next().value;
            if (oldest === undefined) break;
            recentlyFinished.delete(oldest);
        }
    }

    function remove(downloadId: number) {
        activeUrls.delete(downloadId);
    }

    function interceptWebRequest(
        details: WebRequestCandidate,
        tabUrl: string,
        bytes: number,
    ): boolean {
        if (isDisposed || !isCandidateType(details.type)) return false;

        if (hasActiveUrl(details.url)) return true;

        pruneFinished(now());
        if (recentlyFinished.delete(details.url)) return true;

        const entry: HeldRequest = {
            url: details.url,
            tabId: details.tabId,
            tabUrl,
            bytes,
            timer: setTimeout(() => {
                const idx = held.indexOf(entry);
                if (idx === -1) return;
                held.splice(idx, 1);
                if (!isDisposed) onRelease(entry.tabUrl, entry.bytes);
            }, holdMs),
        };
        held.push(entry);
        return true;
    }

    function flushHeld(tabId?: number) {
        if (held.length === 0) return;
        const released: HeldRequest[] = [];
        for (let i = held.length - 1; i >= 0; i -= 1) {
            const entry = held[i]!;
            if (tabId !== undefined && entry.tabId !== tabId) continue;
            clearTimeout(entry.timer);
            held.splice(i, 1);
            released.push(entry);
        }
        for (let i = released.length - 1; i >= 0; i -= 1) {
            const entry = released[i]!;
            onRelease(entry.tabUrl, entry.bytes);
        }
    }

    function dispose() {
        if (isDisposed) return;
        isDisposed = true;
        for (const entry of held) clearTimeout(entry.timer);
        held.length = 0;
        activeUrls.clear();
        recentlyFinished.clear();
    }

    return {
        track,
        finish,
        remove,
        interceptWebRequest,
        flushHeld,
        dispose,
    };
}
