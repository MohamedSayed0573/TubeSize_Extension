import type { Page, Response as PlaywrightResponse, Worker } from "playwright-core";

import {
    launchExtension,
    openToolbarPopup,
    readPageSummary,
    type RuntimeIssue,
    waitForSettle,
} from "./browser";
import { applySeed } from "./seed";

type LiveCheckStatus = "passed" | "failed" | "inconclusive";

export type LiveCheckName = "embed-youtube" | "generic-hls" | "generic-dash" | "generic-direct";

export interface LiveCheckResult {
    name: string;
    kind: "platform-embed" | "hls" | "dash" | "direct" | "custom";
    url: string;
    status: LiveCheckStatus;
    durationMs: number;
    detail: string;
    error?: string;
    issues: RuntimeIssue[];
}

export interface LiveReport {
    status: LiveCheckStatus;
    extId: string;
    totalDurationMs: number;
    checks: LiveCheckResult[];
    issues: RuntimeIssue[];
}

interface ObservedManifest {
    url: string;
    contentType: string;
    body: string;
}

interface PopupFormatRow {
    resolution: number; // 0 for generic "Video"
    label: string;
    sizeBytes: number;
    rateBytesPerMin?: number;
}

interface LivePrepareResult {
    videoDurationSeconds?: number;
    directVideoUrl?: string;
    embedVideoId?: string;
}

interface LiveCheckDefinition {
    name: LiveCheckName;
    kind: "platform-embed" | "hls" | "dash" | "direct";
    url: string;
    prepare: (page: Page, timeoutMs: number) => Promise<LivePrepareResult>;
    assertPopup: (ctx: {
        popupText: string;
        mediaCacheKeys: string[];
        manifests: readonly ObservedManifest[];
        prepared: LivePrepareResult;
    }) => Promise<{ detail: string }>;
}

class InconclusiveError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "InconclusiveError";
    }
}

const NETWORK_INCONCLUSIVE_RE =
    /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_CONNECTION_REFUSED|ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT|ERR_NETWORK_CHANGED|ERR_ADDRESS_UNREACHABLE|NS_ERROR_UNKNOWN_HOST|Timeout \d+ms exceeded/i;

const BOT_OR_AUTH_GATE_RE =
    /just a moment\.\.\.|verify you are human|attention required!\s*\|\s*cloudflare|sign in to confirm you.?re not a bot|checking your browser before accessing/i;

const SI_MULTIPLIERS: Record<string, number> = {
    B: 1,
    KB: 1_000,
    MB: 1_000_000,
    GB: 1_000_000_000,
    TB: 1_000_000_000_000,
};

const SIZE_UNIT_RE = /\b(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)(?:\/(hour|min))?\b/;
const FORMAT_ROW_RE =
    /\b(?:(\d{3,4})p(?:\s+Current)?|(Video))\s+(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)(?!\/)(?:\s+(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)\/(min|hour))?/g;
const RELATIVE_TOLERANCE = 0.03; // Tight enough to catch SI-vs-IEC (7.4%+) or missing audio, allows 2-decimal SI rounding.
const ABSOLUTE_FLOOR_BYTES = 50_000;

function toSiBytes(value: number, unit: string): number {
    return value * (SI_MULTIPLIERS[unit] ?? 1);
}

function formatSiBytes(bytes: number): string {
    if (bytes < 1_000) return `${Math.round(bytes)} B`;
    if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(2)} KB`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(2)} MB`;
    return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

function parsePopupFormatRows(text: string): PopupFormatRow[] {
    const flat = text.replaceAll(/\s+/g, " ").trim();
    const rows: PopupFormatRow[] = [];
    for (const match of flat.matchAll(FORMAT_ROW_RE)) {
        const resStr = match[1];
        const videoLabel = match[2];
        const sizeVal = Number(match[3]);
        const sizeUnit = match[4] ?? "B";
        if (!Number.isFinite(sizeVal) || sizeVal <= 0) continue;

        let rateBytesPerMin: number | undefined;
        if (match[5] && match[6] && match[7]) {
            const rateVal = Number(match[5]);
            const rateBytes = toSiBytes(rateVal, match[6]);
            rateBytesPerMin = match[7] === "hour" ? rateBytes / 60 : rateBytes;
        }

        const resolution = resStr ? Number(resStr) : 0;
        rows.push({
            resolution,
            label: resStr ? `${resStr}p` : (videoLabel ?? "Video"),
            sizeBytes: toSiBytes(sizeVal, sizeUnit),
            ...(rateBytesPerMin !== undefined ? { rateBytesPerMin } : {}),
        });
    }
    return rows;
}

function extractPopupTitle(text: string): string {
    return (
        text
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0)
            ?.slice(0, 60) ?? ""
    );
}

function assertWithinTolerance(opts: {
    label: string;
    actualBytes: number;
    expectedBytes: number;
    tolerance?: number;
}): number {
    const tolerance = opts.tolerance ?? RELATIVE_TOLERANCE;
    const diff = Math.abs(opts.actualBytes - opts.expectedBytes);
    const relError = opts.expectedBytes > 0 ? diff / opts.expectedBytes : 0;
    if (diff > ABSOLUTE_FLOOR_BYTES && relError > tolerance) {
        throw new Error(
            `${opts.label} size mismatch: popup showed ${formatSiBytes(opts.actualBytes)}, ground truth is ${formatSiBytes(opts.expectedBytes)} (${(relError * 100).toFixed(1)}% diff > ${(tolerance * 100).toFixed(0)}% tolerance)`,
        );
    }
    return relError;
}

function assertRateMatchesDuration(rows: readonly PopupFormatRow[], durationSeconds: number): void {
    if (!(durationSeconds > 0)) return;
    const durationMinutes = durationSeconds / 60;
    for (const row of rows) {
        if (row.rateBytesPerMin === undefined) continue;
        const expectedRate = row.sizeBytes / durationMinutes;
        const diff = Math.abs(row.rateBytesPerMin - expectedRate);
        const relError = expectedRate > 0 ? diff / expectedRate : 0;
        if (diff > 5_000 && relError > RELATIVE_TOLERANCE) {
            throw new Error(
                `${row.label} rate mismatch: popup showed ${formatSiBytes(row.rateBytesPerMin)}/min, expected ${formatSiBytes(expectedRate)}/min from ${formatSiBytes(row.sizeBytes)} / ${durationMinutes.toFixed(2)}m`,
            );
        }
    }
}

function parseIsoDurationSeconds(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const match =
        /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(
            raw.trim(),
        );
    if (!match) return undefined;
    const days = match[1] ? Number(match[1]) : 0;
    const hours = match[2] ? Number(match[2]) : 0;
    const mins = match[3] ? Number(match[3]) : 0;
    const secs = match[4] ? Number(match[4]) : 0;
    const total = days * 86_400 + hours * 3_600 + mins * 60 + secs;
    return Number.isFinite(total) && total > 0 ? total : undefined;
}

function parseHlsMasterBandwidths(manifestText: string): Map<number, number> {
    const byResolution = new Map<number, number>();
    const lines = manifestText.split(/\r?\n/);
    for (const line of lines) {
        if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
        const avgBw = line.match(/\bAVERAGE-BANDWIDTH=(\d+)/i)?.[1];
        const bw = line.match(/(?:^|,)BANDWIDTH=(\d+)/i)?.[1];
        const bandwidth = Number(avgBw ?? bw);
        const resHeight = Number(line.match(/\bRESOLUTION=\d+x(\d+)/i)?.[1] ?? 0);
        if (!Number.isFinite(bandwidth) || bandwidth <= 0 || resHeight <= 0) continue;
        const existing = byResolution.get(resHeight) ?? 0;
        if (bandwidth > existing) byResolution.set(resHeight, bandwidth);
    }
    return byResolution;
}

function parseXmlAttr(tag: string, name: string): string | undefined {
    const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
    return match?.[1];
}

function parseDashManifestGroundTruth(xml: string): {
    durationSeconds?: number;
    videoBandwidthByRes: Map<number, number>;
    maxAudioBandwidth: number;
} {
    const mpdOpen = xml.match(/<MPD\b[^>]*>/i)?.[0];
    const durationSeconds = parseIsoDurationSeconds(
        mpdOpen ? parseXmlAttr(mpdOpen, "mediaPresentationDuration") : undefined,
    );

    const videoBandwidthByRes = new Map<number, number>();
    let maxAudioBandwidth = 0;

    const adaptationRe = /<AdaptationSet\b([^>]*)>([\s\S]*?)<\/AdaptationSet>/gi;
    for (const setMatch of xml.matchAll(adaptationRe)) {
        const setAttrs = setMatch[1] ?? "";
        const setBody = setMatch[2] ?? "";
        const setContentType = parseXmlAttr(setAttrs, "contentType")?.toLowerCase();
        const setMimeType = parseXmlAttr(setAttrs, "mimeType")?.toLowerCase();
        const setHeight = Number(parseXmlAttr(setAttrs, "height") ?? 0);

        const repRe = /<Representation\b([^>]*)\/?>/gi;
        for (const repMatch of setBody.matchAll(repRe)) {
            const repAttrs = repMatch[1] ?? "";
            const bandwidth = Number(parseXmlAttr(repAttrs, "bandwidth") ?? 0);
            if (!Number.isFinite(bandwidth) || bandwidth <= 0) continue;

            const repMime = parseXmlAttr(repAttrs, "mimeType")?.toLowerCase() ?? setMimeType;
            const height = Number(parseXmlAttr(repAttrs, "height") ?? setHeight);
            const isAudio = setContentType === "audio" || repMime?.startsWith("audio/");

            if (isAudio) {
                if (bandwidth > maxAudioBandwidth) maxAudioBandwidth = bandwidth;
                continue;
            }
            if (height > 0) {
                const existing = videoBandwidthByRes.get(height) ?? 0;
                if (bandwidth > existing) videoBandwidthByRes.set(height, bandwidth);
            }
        }
    }

    return { durationSeconds, videoBandwidthByRes, maxAudioBandwidth };
}

async function probeDirectHttpSize(url: string): Promise<number | undefined> {
    try {
        const head = await fetch(url, { method: "HEAD" });
        if (head.ok) {
            const len = Number(head.headers.get("content-length"));
            if (Number.isFinite(len) && len > 0) return len;
        }
    } catch {
        // Fall through to Range probe.
    }
    try {
        const range = await fetch(url, { headers: { Range: "bytes=0-0" } });
        await range.body?.cancel();
        if (range.status === 206) {
            const total = Number(range.headers.get("content-range")?.split("/", 2)[1]);
            if (Number.isFinite(total) && total > 0) return total;
        }
        const len = Number(range.headers.get("content-length"));
        if (Number.isFinite(len) && len > 0) return len;
    } catch {
        // Independent probe failed.
    }
    return undefined;
}

interface YoutubeAdaptiveFormat {
    mimeType?: string;
    height?: number;
    qualityLabel?: string;
    contentLength?: string;
    bitrate?: number;
    approxDurationMs?: string;
}

function extractBalancedJsonObject(source: string, marker: string): string | undefined {
    const markerIdx = source.indexOf(marker);
    if (markerIdx === -1) return undefined;
    const start = source.indexOf("{", markerIdx + marker.length);
    if (start === -1) return undefined;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (inString) {
            if (escaped) escaped = false;
            else if (ch === "\\") escaped = true;
            else if (ch === '"') inString = false;
            continue;
        }
        if (ch === '"') inString = true;
        else if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) return source.slice(start, i + 1);
        }
    }
    return undefined;
}

async function fetchYoutubeGroundTruth(videoId: string): Promise<{
    durationSeconds: number;
    rangeByResolution: Map<number, { minBytes: number; maxBytes: number }>;
} | null> {
    const res = await fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
        headers: { "accept-language": "en-US,en;q=0.9" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const rawJson = extractBalancedJsonObject(html, "ytInitialPlayerResponse =");
    if (!rawJson) return null;

    const parsed = JSON.parse(rawJson) as {
        videoDetails?: { lengthSeconds?: string };
        streamingData?: { adaptiveFormats?: YoutubeAdaptiveFormat[] };
    };
    const durationSeconds = Number(parsed.videoDetails?.lengthSeconds ?? 0);
    const adaptive = parsed.streamingData?.adaptiveFormats ?? [];
    if (!(durationSeconds > 0) || adaptive.length === 0) return null;

    const formatBytes = (fmt: YoutubeAdaptiveFormat): number | undefined => {
        const cl = Number(fmt.contentLength);
        if (Number.isFinite(cl) && cl > 0) return cl;
        const durSec = Number(fmt.approxDurationMs) / 1000 || durationSeconds;
        if (fmt.bitrate && fmt.bitrate > 0 && durSec > 0) {
            return (fmt.bitrate / 8) * durSec;
        }
        return undefined;
    };

    const audioSizes: number[] = [];
    const videoByRes = new Map<number, number[]>();

    for (const fmt of adaptive) {
        const bytes = formatBytes(fmt);
        if (bytes === undefined) continue;
        if (fmt.mimeType?.startsWith("audio/")) {
            audioSizes.push(bytes);
            continue;
        }
        if (fmt.mimeType?.startsWith("video/")) {
            const labelHeight = Number(fmt.qualityLabel?.match(/^(\d{3,4})p/i)?.[1] ?? 0);
            const resHeight = labelHeight > 0 ? labelHeight : (fmt.height ?? 0);
            if (!(resHeight > 0)) continue;
            const list = videoByRes.get(resHeight) ?? [];
            list.push(bytes);
            videoByRes.set(resHeight, list);
        }
    }

    const minAudio = audioSizes.length > 0 ? Math.min(...audioSizes) : 0;
    const maxAudio = audioSizes.length > 0 ? Math.max(...audioSizes) : 0;
    const rangeByResolution = new Map<number, { minBytes: number; maxBytes: number }>();
    for (const [resHeight, sizes] of videoByRes) {
        rangeByResolution.set(resHeight, {
            minBytes: Math.min(...sizes) + minAudio,
            maxBytes: Math.max(...sizes) + maxAudio,
        });
    }

    return { durationSeconds, rangeByResolution };
}

async function waitForBlobVideoLoaded(page: Page, timeoutMs: number): Promise<number | undefined> {
    await page.waitForFunction(
        () => {
            const videos = Array.from(document.querySelectorAll("video"));
            return videos.some((video) => {
                const src = video.getAttribute("src") || video.currentSrc || "";
                const hasDuration = Number.isFinite(video.duration) && video.duration > 0;
                return src.startsWith("blob:") && (video.readyState >= 1 || hasDuration);
            });
        },
        undefined,
        { timeout: timeoutMs },
    );
    return await page.evaluate(() => {
        for (const video of document.querySelectorAll("video")) {
            const src = video.getAttribute("src") || video.currentSrc || "";
            if (src.startsWith("blob:") && Number.isFinite(video.duration) && video.duration > 0) {
                return video.duration;
            }
        }
        return undefined;
    });
}

async function waitForEmbedFrame(page: Page, pattern: RegExp, timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const matched = page.frames().find((frame) => pattern.test(frame.url()));
        if (matched) return matched.url();
        await Bun.sleep(150);
    }
    throw new InconclusiveError(
        `Timed out waiting for embedded player frame matching ${pattern} on ${page.url()}`,
    );
}

const LIVE_CHECKS: readonly LiveCheckDefinition[] = [
    {
        name: "embed-youtube",
        kind: "platform-embed",
        url: "https://developers.google.com/youtube/youtube_player_demo",
        async prepare(page, timeoutMs) {
            const frameUrl = await waitForEmbedFrame(
                page,
                /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/i,
                timeoutMs,
            );
            const embedVideoId = frameUrl.match(/\/embed\/([A-Za-z0-9_-]{11})/i)?.[1];
            await Bun.sleep(1_000);
            return { embedVideoId };
        },
        async assertPopup({ popupText, mediaCacheKeys, prepared }) {
            const rows = parsePopupFormatRows(popupText).filter((r) => r.resolution > 0);
            if (rows.length < 2) {
                throw new Error(
                    `Expected >=2 quality tiers for embedded YouTube video, got ${rows.length}. Popup: ${popupText.slice(0, 260)}`,
                );
            }
            const ytKey = mediaCacheKeys.find((key) => key.startsWith("youtube:"));
            if (!ytKey) {
                throw new Error(
                    `Expected cached youtube:* entry in mediaCacheKeys, got ${JSON.stringify(mediaCacheKeys)}`,
                );
            }

            const videoId = prepared.embedVideoId ?? ytKey.slice("youtube:".length);
            const truth = await fetchYoutubeGroundTruth(videoId);
            if (!truth || truth.rangeByResolution.size === 0) {
                throw new InconclusiveError(
                    `Could not fetch independent YouTube adaptiveFormats ground truth for ${videoId}`,
                );
            }

            assertRateMatchesDuration(rows, truth.durationSeconds);

            let verifiedCount = 0;
            for (const row of rows) {
                const bounds = truth.rangeByResolution.get(row.resolution);
                if (!bounds) continue;
                const lower = bounds.minBytes * (1 - RELATIVE_TOLERANCE) - ABSOLUTE_FLOOR_BYTES;
                const upper = bounds.maxBytes * (1 + RELATIVE_TOLERANCE) + ABSOLUTE_FLOOR_BYTES;
                if (row.sizeBytes < lower || row.sizeBytes > upper) {
                    throw new Error(
                        `${row.label} size ${formatSiBytes(row.sizeBytes)} outside YouTube adaptiveFormats ground truth [${formatSiBytes(bounds.minBytes)}, ${formatSiBytes(bounds.maxBytes)}]`,
                    );
                }
                verifiedCount++;
            }
            if (verifiedCount < 2) {
                throw new Error(
                    `Only matched ${verifiedCount} resolution(s) against YouTube adaptiveFormats ground truth`,
                );
            }

            const top = rows[0]!;
            const title = extractPopupTitle(popupText);
            return {
                detail: `"${title}" · ${top.label} ${formatSiBytes(top.sizeBytes)} (${verifiedCount} tiers matched adaptiveFormats, cached ${ytKey})`,
            };
        },
    },
    {
        name: "generic-hls",
        kind: "hls",
        url: "https://hlsjs.video-dev.org/demo/",
        async prepare(page, timeoutMs) {
            const videoDurationSeconds = await waitForBlobVideoLoaded(page, timeoutMs);
            await Bun.sleep(500);
            return { videoDurationSeconds };
        },
        async assertPopup({ popupText, mediaCacheKeys, manifests, prepared }) {
            const rows = parsePopupFormatRows(popupText).filter((r) => r.resolution > 0);
            if (rows.length < 2) {
                throw new Error(
                    `Expected >=2 quality tiers for live HLS demo, got ${rows.length}. Popup: ${popupText.slice(0, 260)}`,
                );
            }
            if (mediaCacheKeys.some((key) => key.startsWith("generic:"))) {
                throw new Error(
                    `Generic HLS estimate should not be cached: ${JSON.stringify(mediaCacheKeys)}`,
                );
            }

            const master = manifests.find((m) => m.body.includes("#EXT-X-STREAM-INF:"));
            const duration = prepared.videoDurationSeconds;
            if (!master || !duration) {
                throw new InconclusiveError(
                    `Missing independent HLS ground truth (master=${Boolean(master)}, duration=${String(duration)})`,
                );
            }

            const bandwidthByRes = parseHlsMasterBandwidths(master.body);
            assertRateMatchesDuration(rows, duration);

            let verifiedCount = 0;
            let maxErrPct = 0;
            for (const row of rows) {
                const bw = bandwidthByRes.get(row.resolution);
                if (!bw) continue;
                const expectedBytes = (bw / 8) * duration;
                const err = assertWithinTolerance({
                    label: `HLS ${row.label}`,
                    actualBytes: row.sizeBytes,
                    expectedBytes,
                });
                if (err * 100 > maxErrPct) maxErrPct = err * 100;
                verifiedCount++;
            }
            if (verifiedCount < 2) {
                throw new Error(
                    `Only matched ${verifiedCount} resolution(s) against observed HLS master playlist`,
                );
            }

            const top = rows[0]!;
            const topExpected = ((bandwidthByRes.get(top.resolution) ?? 0) / 8) * duration;
            const title = extractPopupTitle(popupText);
            return {
                detail: `"${title}" · ${top.label} ${formatSiBytes(top.sizeBytes)} vs ${formatSiBytes(topExpected)} manifest (${verifiedCount} tiers, max ${maxErrPct.toFixed(2)}% diff)`,
            };
        },
    },
    {
        name: "generic-dash",
        kind: "dash",
        url: "https://reference.dashif.org/dash.js/latest/samples/dash-if-reference-player/index.html",
        async prepare(page, timeoutMs) {
            const loadBtn = page.getByRole("button", { name: "Load" }).first();
            await loadBtn.waitFor({ state: "visible", timeout: timeoutMs });
            await loadBtn.click();
            const videoDurationSeconds = await waitForBlobVideoLoaded(page, timeoutMs);
            await Bun.sleep(500);
            return { videoDurationSeconds };
        },
        async assertPopup({ popupText, manifests, prepared }) {
            const rows = parsePopupFormatRows(popupText).filter((r) => r.resolution > 0);
            if (rows.length < 2) {
                throw new Error(
                    `Expected >=2 quality tiers for live DASH demo, got ${rows.length}. Popup: ${popupText.slice(0, 260)}`,
                );
            }

            const mpd = manifests.find((m) => /<MPD\b/i.test(m.body));
            if (!mpd) {
                throw new InconclusiveError(
                    "Did not capture .mpd manifest response for ground truth",
                );
            }

            const truth = parseDashManifestGroundTruth(mpd.body);
            const duration = prepared.videoDurationSeconds ?? truth.durationSeconds;
            if (!duration) {
                throw new InconclusiveError("Could not determine DASH duration for ground truth");
            }

            assertRateMatchesDuration(rows, duration);

            let verifiedCount = 0;
            let maxErrPct = 0;
            for (const row of rows) {
                const videoBw = truth.videoBandwidthByRes.get(row.resolution);
                if (!videoBw) continue;
                const expectedBytes = ((videoBw + truth.maxAudioBandwidth) / 8) * duration;
                const err = assertWithinTolerance({
                    label: `DASH ${row.label}`,
                    actualBytes: row.sizeBytes,
                    expectedBytes,
                });
                if (err * 100 > maxErrPct) maxErrPct = err * 100;
                verifiedCount++;
            }
            if (verifiedCount < 2) {
                throw new Error(
                    `Only matched ${verifiedCount} resolution(s) against observed DASH MPD manifest`,
                );
            }

            const top = rows[0]!;
            const topExpected =
                (((truth.videoBandwidthByRes.get(top.resolution) ?? 0) + truth.maxAudioBandwidth) /
                    8) *
                duration;
            const title = extractPopupTitle(popupText);
            return {
                detail: `"${title}" · ${top.label} ${formatSiBytes(top.sizeBytes)} vs ${formatSiBytes(topExpected)} MPD (${verifiedCount} tiers, max ${maxErrPct.toFixed(2)}% diff)`,
            };
        },
    },
    {
        name: "generic-direct",
        kind: "direct",
        url: "https://www.w3.org/2010/05/video/mediaevents.html",
        async prepare(page, timeoutMs) {
            await page.waitForFunction(
                () => {
                    const video = document.querySelector("video");
                    if (!video) return false;
                    return Boolean(
                        video.getAttribute("src") ||
                        video.currentSrc ||
                        video.querySelector("source[src]"),
                    );
                },
                undefined,
                { timeout: timeoutMs },
            );
            await Bun.sleep(500);
            const directVideoUrl = await page.evaluate(() => {
                const video = document.querySelector("video");
                if (!video) return undefined;
                const raw =
                    video.currentSrc ||
                    video.getAttribute("src") ||
                    video.querySelector("source[src]")?.getAttribute("src");
                return raw ? new URL(raw, document.baseURI).href : undefined;
            });
            return { directVideoUrl };
        },
        async assertPopup({ popupText, prepared }) {
            const rows = parsePopupFormatRows(popupText);
            if (rows.length === 0) {
                throw new Error(
                    `Expected direct video format row with SI size, got: ${popupText.slice(0, 260)}`,
                );
            }
            if (!prepared.directVideoUrl) {
                throw new InconclusiveError(
                    "Could not read direct <video> source URL for independent Content-Length probe",
                );
            }

            const httpBytes = await probeDirectHttpSize(prepared.directVideoUrl);
            if (httpBytes === undefined) {
                throw new InconclusiveError(
                    `Independent HTTP HEAD/Range probe returned no Content-Length for ${prepared.directVideoUrl}`,
                );
            }

            const row = rows[0]!;
            const err = assertWithinTolerance({
                label: `Direct ${row.label}`,
                actualBytes: row.sizeBytes,
                expectedBytes: httpBytes,
            });
            const title = extractPopupTitle(popupText);
            return {
                detail: `"${title}" · ${row.label} ${formatSiBytes(row.sizeBytes)} vs ${formatSiBytes(httpBytes)} HTTP Content-Length (${(err * 100).toFixed(2)}% diff)`,
            };
        },
    },
];

export const LIVE_CHECK_NAMES: readonly LiveCheckName[] = LIVE_CHECKS.map((c) => c.name);

export function isLiveCheckName(raw: string): raw is LiveCheckName {
    return (LIVE_CHECK_NAMES as readonly string[]).includes(raw);
}

function isExtensionIssue(issue: RuntimeIssue, extId: string): boolean {
    if (issue.source === "service-worker" || issue.source === "network") return true;
    return issue.message.includes(`chrome-extension://${extId}/`);
}

async function readMediaCacheKeys(serviceWorker: Worker): Promise<string[]> {
    return await serviceWorker.evaluate(async () => {
        const all = await chrome.storage.local.get(null);
        return Object.keys(all)
            .filter(
                (key) =>
                    key.startsWith("youtube:") ||
                    key.startsWith("twitch:") ||
                    key.startsWith("kick:") ||
                    key.startsWith("generic:"),
            )
            .sort();
    });
}

async function waitForRealPopupReady(popupPage: Page, timeoutMs: number): Promise<string> {
    await popupPage.waitForFunction(
        () => {
            const root = document.getElementById("root");
            if (!root) return false;
            if (root.querySelector('[data-slot="skeleton"], .animate-spin')) return false;
            const txt = root.innerText.trim();
            return txt.length > 0;
        },
        undefined,
        { timeout: timeoutMs },
    );

    const summary = await readPageSummary(popupPage);
    if (summary.hasErrorBoundary) {
        throw new Error("Popup rendered an error boundary.");
    }

    const text = await popupPage.evaluate(() => {
        const root = document.getElementById("root") ?? document.body;
        return (root?.innerText || "").trim();
    });

    if (text.includes("Size estimates unavailable")) {
        throw new Error(
            `TubeSize did not detect a video on this page ("Size estimates unavailable").`,
        );
    }
    if (text.includes("Multiple videos detected")) {
        throw new Error(
            `Popup rendered "Multiple videos detected" (play a video on the page first).`,
        );
    }
    if (/\bRetry\b/.test(text) && !SIZE_UNIT_RE.test(text)) {
        throw new Error(`Popup rendered an estimation error card: ${text.slice(0, 260)}`);
    }

    return text;
}

async function navigateLivePage(page: Page, url: string, timeoutMs: number): Promise<void> {
    let response;
    try {
        response = await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (NETWORK_INCONCLUSIVE_RE.test(msg)) {
            throw new InconclusiveError(`Network unreachable or timed out loading ${url}: ${msg}`);
        }
        throw err;
    }

    const status = response?.status();
    if (
        status !== undefined &&
        (status === 401 || status === 403 || status === 429 || status >= 500)
    ) {
        throw new InconclusiveError(`Upstream returned HTTP ${status} for ${url}`);
    }

    await waitForSettle(page, Math.min(timeoutMs, 6_000));

    const gateCheck = await page.evaluate(() => {
        const title = document.title || "";
        const sample = (document.body?.innerText || "").slice(0, 1200);
        return `${title}\n${sample}`;
    });
    if (BOT_OR_AUTH_GATE_RE.test(gateCheck)) {
        throw new InconclusiveError(`Blocked by upstream bot check or sign-in gate at ${url}`);
    }
}

function isManifestResponse(url: string, contentType: string): boolean {
    const lowerUrl = url.toLowerCase();
    const lowerType = contentType.toLowerCase();
    return (
        lowerUrl.includes(".m3u8") ||
        lowerUrl.includes(".mpd") ||
        lowerType.includes("mpegurl") ||
        lowerType.includes("dash+xml")
    );
}

export async function runLiveValidation(opts: {
    extDir: string;
    timeoutMs: number;
    checkNames?: readonly LiveCheckName[];
    customUrl?: string;
}): Promise<LiveReport> {
    const suiteStartedAt = performance.now();
    let launchPromise: Promise<Awaited<ReturnType<typeof launchExtension>>> | null = null;
    let browser: Awaited<ReturnType<typeof launchExtension>> | null = null;
    let closePopupFn: (() => Promise<void>) | null = null;
    let cleanupPromise: Promise<void> | null = null;
    let interrupted = false;
    let signalExitScheduled = false;

    const closeActivePopup = async () => {
        if (!closePopupFn) return;
        const close = closePopupFn;
        closePopupFn = null;
        await close();
    };

    const cleanup = (): Promise<void> => {
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
            await closeActivePopup();
            if (launchPromise) {
                try {
                    browser = await launchPromise;
                } catch {
                    // launchExtension cleans up its ephemeral profile on failure.
                }
                launchPromise = null;
            }
            if (browser) {
                await browser.close();
                browser = null;
            }
        })();
        return cleanupPromise;
    };

    const onSignal = (sig: NodeJS.Signals) => {
        interrupted = true;
        if (signalExitScheduled) return;
        signalExitScheduled = true;
        void cleanup().finally(() => {
            process.exit(sig === "SIGINT" ? 130 : 143);
        });
    };
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);

    try {
        launchPromise = launchExtension(opts.extDir, opts.timeoutMs, { enableCdp: true });
        browser = await launchPromise;
        launchPromise = null;
        if (interrupted) {
            await cleanup();
            process.exit(130);
        }

        const { extId, page: mainPage, serviceWorker, cdpPort, issues: browserIssues } = browser;
        if (!cdpPort) {
            throw new Error("CDP port was not assigned for live validation session.");
        }

        await applySeed(serviceWorker, "empty");
        await serviceWorker.evaluate(async () => {
            await chrome.storage.sync.set({
                language: "en",
                advancedView: false,
                toasterEnabled: false,
            });
        });

        const popupIssues: RuntimeIssue[] = [];
        const allExtensionIssues: RuntimeIssue[] = [];

        const withToolbarPopup = async <T>(fn: (popupPage: Page) => Promise<T>): Promise<T> => {
            await closeActivePopup();
            const opened = await openToolbarPopup({
                mainPage,
                serviceWorker,
                cdpPort,
                extId,
                issues: popupIssues,
                timeoutMs: 8_000,
            });
            closePopupFn = opened.close;
            try {
                return await fn(opened.popupPage);
            } finally {
                await closeActivePopup();
            }
        };

        const tasks: Array<{
            name: string;
            kind: LiveCheckResult["kind"];
            url: string;
            prepare: (page: Page, timeoutMs: number) => Promise<LivePrepareResult>;
            assertPopup: (ctx: {
                popupText: string;
                mediaCacheKeys: string[];
                manifests: readonly ObservedManifest[];
                prepared: LivePrepareResult;
            }) => Promise<{ detail: string }>;
        }> = opts.customUrl
            ? [
                  {
                      name: "custom-url",
                      kind: "custom",
                      url: opts.customUrl,
                      async prepare(page) {
                          await Bun.sleep(3_000);
                          const info = await page.evaluate(() => {
                              const video = document.querySelector("video");
                              if (!video) return {};
                              const raw =
                                  video.currentSrc ||
                                  video.getAttribute("src") ||
                                  video.querySelector("source[src]")?.getAttribute("src");
                              const directVideoUrl =
                                  raw && !raw.startsWith("blob:")
                                      ? new URL(raw, document.baseURI).href
                                      : undefined;
                              const videoDurationSeconds =
                                  Number.isFinite(video.duration) && video.duration > 0
                                      ? video.duration
                                      : undefined;
                              return { directVideoUrl, videoDurationSeconds };
                          });
                          return info;
                      },
                      async assertPopup({ popupText, prepared }) {
                          const rows = parsePopupFormatRows(popupText);
                          if (rows.length === 0) {
                              throw new Error(
                                  `Popup settled without any SI size or rate: ${popupText.slice(0, 260)}`,
                              );
                          }
                          if (prepared.videoDurationSeconds) {
                              assertRateMatchesDuration(rows, prepared.videoDurationSeconds);
                          }
                          const title = extractPopupTitle(popupText);
                          const top = rows[0]!;
                          if (prepared.directVideoUrl && rows.length === 1) {
                              const httpBytes = await probeDirectHttpSize(prepared.directVideoUrl);
                              if (httpBytes !== undefined) {
                                  const err = assertWithinTolerance({
                                      label: `Direct ${top.label}`,
                                      actualBytes: top.sizeBytes,
                                      expectedBytes: httpBytes,
                                  });
                                  return {
                                      detail: `"${title}" · ${top.label} ${formatSiBytes(top.sizeBytes)} vs ${formatSiBytes(httpBytes)} HTTP Content-Length (${(err * 100).toFixed(2)}% diff)`,
                                  };
                              }
                          }
                          return {
                              detail: `"${title}" · ${top.label} ${formatSiBytes(top.sizeBytes)} (${rows.length} format(s))`,
                          };
                      },
                  },
              ]
            : LIVE_CHECKS.filter(
                  (check) => !opts.checkNames || opts.checkNames.includes(check.name),
              );

        const checks: LiveCheckResult[] = [];
        const navTimeoutMs = Math.min(opts.timeoutMs, 20_000);

        for (const task of tasks) {
            const startedAt = performance.now();
            const browserIssueStart = browserIssues.length;
            const popupIssueStart = popupIssues.length;
            const manifests: ObservedManifest[] = [];
            const pendingReads: Promise<void>[] = [];

            const onResponse = (res: PlaywrightResponse) => {
                const url = res.url();
                const contentType = res.headers()["content-type"] ?? "";
                if (!res.ok() || !isManifestResponse(url, contentType)) return;
                const readPromise = (async () => {
                    try {
                        const body = await res.text();
                        if (body.length > 0 && body.length <= 2_000_000) {
                            manifests.push({ url, contentType, body });
                        }
                    } catch {
                        // Response body may be unavailable if request was cancelled.
                    }
                })();
                pendingReads.push(readPromise);
            };
            mainPage.on("response", onResponse);

            let status: LiveCheckStatus = "passed";
            let detail = "";
            let error: string | undefined;

            try {
                await navigateLivePage(mainPage, task.url, navTimeoutMs);
                let prepared: LivePrepareResult;
                try {
                    prepared = await task.prepare(mainPage, navTimeoutMs);
                } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (NETWORK_INCONCLUSIVE_RE.test(msg)) {
                        throw new InconclusiveError(
                            `Timed out waiting for upstream media on ${task.url}: ${msg}`,
                        );
                    }
                    throw err;
                }

                await Promise.allSettled(pendingReads);

                const popupText = await withToolbarPopup(
                    async (popupPage) => await waitForRealPopupReady(popupPage, 15_000),
                );
                const mediaCacheKeys = await readMediaCacheKeys(serviceWorker);
                const verified = await task.assertPopup({
                    popupText,
                    mediaCacheKeys,
                    manifests,
                    prepared,
                });
                detail = verified.detail;
            } catch (err) {
                if (err instanceof InconclusiveError) {
                    status = "inconclusive";
                    error = err.message;
                } else {
                    status = "failed";
                    error = err instanceof Error ? err.message : String(err);
                }
            } finally {
                mainPage.off("response", onResponse);
                await closeActivePopup();
            }

            const stepExtIssues = [
                ...browserIssues
                    .slice(browserIssueStart)
                    .filter((issue) => isExtensionIssue(issue, extId)),
                ...popupIssues.slice(popupIssueStart),
            ];
            allExtensionIssues.push(...stepExtIssues);

            if (status === "passed" && stepExtIssues.length > 0) {
                status = "failed";
                error = `${stepExtIssues.length} extension runtime issue(s): ${stepExtIssues.map((i) => `${i.source}/${i.level}: ${i.message}`).join("; ")}`;
            }

            checks.push({
                name: task.name,
                kind: task.kind,
                url: task.url,
                status,
                durationMs: Math.round(performance.now() - startedAt),
                detail,
                ...(error ? { error } : {}),
                issues: stepExtIssues,
            });
        }

        const hasFailed =
            checks.some((c) => c.status === "failed") || allExtensionIssues.length > 0;
        const hasInconclusive = checks.some((c) => c.status === "inconclusive");
        const status: LiveCheckStatus = hasFailed
            ? "failed"
            : hasInconclusive
              ? "inconclusive"
              : "passed";

        return {
            status,
            extId,
            totalDurationMs: Math.round(performance.now() - suiteStartedAt),
            checks,
            issues: allExtensionIssues,
        };
    } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
        await cleanup();
    }
}
