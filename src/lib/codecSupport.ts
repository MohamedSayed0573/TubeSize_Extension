import { codecSupport, type CodecSupportCache } from "@lib/storage";

// Level 5.0 covers 1440p/2160p AV1, which is what we need before using AV1
// above 1080p.
const AV1_MIME_TYPE = 'video/mp4; codecs="av01.0.12M.08"';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

async function detectAv1Support(): Promise<boolean | undefined> {
    if (typeof navigator !== "undefined" && navigator.mediaCapabilities?.decodingInfo) {
        try {
            const { supported, powerEfficient } = await navigator.mediaCapabilities.decodingInfo({
                type: "media-source",
                video: {
                    contentType: AV1_MIME_TYPE,
                    width: 3840,
                    height: 2160,
                    bitrate: 2_800_000,
                    framerate: 30,
                },
            });
            // Software AV1 decoding is not enough: only prefer AV1 when the
            // device can decode it efficiently.
            return supported && powerEfficient;
        } catch (err) {
            console.error("Failed to detect AV1 support with MediaCapabilities", err);
        }
    }

    return undefined;
}

function isFresh(cached: CodecSupportCache): boolean {
    return Date.now() - cached.checkedAt < MAX_AGE_MS;
}

/**
 * Reads cached AV1 support and refreshes it when missing or stale. Returns the
 * last known value when the current context cannot check media capabilities.
 */
export async function getAv1Support(): Promise<boolean | undefined> {
    const cached = await codecSupport.getValue();
    if (cached && isFresh(cached)) return cached.av1;

    const av1 = await detectAv1Support();
    if (av1 === undefined) return cached?.av1;

    await codecSupport.setValue({
        av1,
        checkedAt: Date.now(),
    });
    return av1;
}

/**
 * Returns the last detected value without running detection. Background
 * contexts use this when the content script has already reported support.
 */
export async function getCachedAv1Support(): Promise<boolean | undefined> {
    const cached = await codecSupport.getValue();
    return cached?.av1;
}
