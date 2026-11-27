const CONTENT_DISPOSITION_HEADER = "content-disposition";
const ATTACHMENT_DISPOSITION_RE = /^\s*attachment(?:\s*;|\s*$)/i;
const DEFAULT_HOLD_MS = 500;
const DEFAULT_FINISHED_TTL_MS = 2_000;
const MAX_RECENT_FINISHED = 256;

type WebRequestCandidate = Pick<chrome.webRequest.OnCompletedDetails, "url" | "type">;

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
    dispose(): void;
}

interface ActiveDownloadEntry {
    urls: Set<string>;
    matched: boolean;
}

interface HeldRequest {
    url: string;
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

    const activeDownloads = new Map<number, ActiveDownloadEntry>();
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

    function matchActiveUrl(url: string): boolean {
        for (const entry of activeDownloads.values()) {
            if (entry.urls.has(url)) {
                entry.matched = true;
                return true;
            }
        }
        return false;
    }

    function track(downloadId: number, urls: ReadonlyArray<string | undefined>) {
        if (isDisposed) return;
        const cleanUrls = collectUrls(urls);
        if (cleanUrls.length === 0) return;

        let entry = activeDownloads.get(downloadId);
        if (!entry) {
            entry = { urls: new Set<string>(), matched: false };
            activeDownloads.set(downloadId, entry);
        }
        for (const url of cleanUrls) entry.urls.add(url);
        if (cancelHeldMatching(cleanUrls)) {
            entry.matched = true;
        }
    }

    function finish(downloadId: number, urls: ReadonlyArray<string | undefined> = []) {
        const active = activeDownloads.get(downloadId);
        activeDownloads.delete(downloadId);
        if (isDisposed) return;

        const allUrls = collectUrls([...(active?.urls ?? []), ...urls]);
        if (allUrls.length === 0) return;

        const cancelled = cancelHeldMatching(allUrls);
        if (cancelled || active?.matched) return;

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
        activeDownloads.delete(downloadId);
    }

    function interceptWebRequest(
        details: WebRequestCandidate,
        tabUrl: string,
        bytes: number,
    ): boolean {
        if (isDisposed || !isCandidateType(details.type)) return false;

        if (matchActiveUrl(details.url)) return true;

        pruneFinished(now());
        if (recentlyFinished.delete(details.url)) return true;

        const entry: HeldRequest = {
            url: details.url,
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

    function dispose() {
        if (isDisposed) return;
        isDisposed = true;
        for (const entry of held) clearTimeout(entry.timer);
        held.length = 0;
        activeDownloads.clear();
        recentlyFinished.clear();
    }

    return {
        track,
        finish,
        remove,
        interceptWebRequest,
        dispose,
    };
}
