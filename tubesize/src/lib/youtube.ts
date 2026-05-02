import type {
    AudioCodecFamilies,
    RawData,
    StreamInfo,
    VideoCodecFamilies,
    YoutubeVideoFormat,
} from "@app-types/types";
import { fetchAndRetry } from "@lib/utils";
import CONFIG from "@lib/constants";

export function sizePerMinute(
    sizeInBytes: number,
    durationInSeconds: number,
    isLive = false,
): number {
    const durationInMinutes = durationInSeconds / 60;
    const sizeInMB = sizeInBytes / 1_000_000;

    if (isLive) return Number((sizeInMB / 60).toFixed(2));
    if (durationInSeconds === 0) return 0;

    return Number((sizeInMB / durationInMinutes).toFixed(2));
}

export async function extractRawData(videoTag: string, html: string | undefined): Promise<RawData> {
    let rawData: RawData | undefined;
    try {
        if (!html) throw new Error("No HTML");
        rawData = extractYtInitial(html);
        if (rawData.videoDetails.videoId !== videoTag) {
            throw new Error("Video ID mismatch");
        }
    } catch {
        const pageHtml = await fetchHTMLPage(videoTag);
        rawData = extractYtInitial(pageHtml);
    }
    if (!rawData) {
        throw new Error("Failed to extract raw data");
    }
    return rawData;
}

export function getAverageAudioSize(audioFormatArray: { sizeBytes: number }[]): number {
    // Note: ytInitialPlayerResponse usually returns three formats with itag 251, so we take the average of the content size of all three.
    if (audioFormatArray.length === 0) return 0;
    if (audioFormatArray.length === 1) return Math.round(audioFormatArray[0].sizeBytes);
    return Math.round(
        audioFormatArray.reduce((acc, format) => {
            return acc + format.sizeBytes;
        }, 0) / audioFormatArray.length,
    );
}

export function mergeAudioWithVideo(
    videoFormats: YoutubeVideoFormat[],
    audioSize: number,
    type: "video",
): YoutubeVideoFormat[];
export function mergeAudioWithVideo(
    videoFormats: StreamInfo[],
    audioSize: number,
    type: "live",
): StreamInfo[];
export function mergeAudioWithVideo(
    videoFormats: YoutubeVideoFormat[] | StreamInfo[],
    audioSize: number,
    type: "video" | "live",
): YoutubeVideoFormat[] | StreamInfo[] {
    if (type === "video") {
        const typedVideoFormats = videoFormats as YoutubeVideoFormat[];
        return typedVideoFormats.map((videoFormat) => {
            return {
                ...videoFormat,
                sizeBytes: videoFormat.sizeBytes + audioSize,
            };
        });
    } else {
        const typedVideoFormats = videoFormats as StreamInfo[];
        return typedVideoFormats.map((videoFormat) => {
            return {
                ...videoFormat,
                sizePerSecondBytes: videoFormat.sizePerSecondBytes + audioSize / 3600,
            };
        });
    }
}

async function fetchHTMLPage(videoTag: string) {
    const res = await fetchAndRetry(`https://www.youtube.com/watch?v=${videoTag}`, {
        method: "GET",
        signal: AbortSignal.timeout(CONFIG.FETCH_HTML_TIMEOUT),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fetchedHtml = await res.text();
    return fetchedHtml;
}

export function extractYtInitial(html: string): RawData {
    const match = html.match(CONFIG.YT_INITIAL_PLAYER_REGEX);
    if (!match || !match[1]) throw new Error("No match found");
    const data = JSON.parse(match[1]) as unknown as RawData;
    if (!data) throw new Error("No data found");
    return data;
}

function extractVideoCodec(mimeType: string | undefined): VideoCodecFamilies | undefined {
    if (!mimeType) return undefined;
    const codec = mimeType.split('codecs="')[1]?.split('"')[0];
    if (codec.includes("av01")) return "AV1";
    if (codec.includes("avc1")) return "H.264";
    if (codec.includes("vp9")) return "VP9";
    if (codec.includes("vp8")) return "VP8";
    console.log(`Unknown codec for mimeType: ${mimeType}`);
    return undefined;
}

function extractAudioCodec(mimeType: string | undefined): AudioCodecFamilies | undefined {
    if (!mimeType) return undefined;
    const codec = mimeType.split('codecs="')[1]?.split('"')[0];
    if (codec.includes("opus")) return "OPUS";
    if (codec.includes("mp4a")) return "MP4A";
    console.log(`Unknown audio codec for mimeType: ${mimeType}`);
    return undefined;
}

function chooseVideoFormats(
    data: RawData,
    currentVideoData: { videoItag: number; audioItag: number },
    type: "video",
): YoutubeVideoFormat[];
function chooseVideoFormats(
    data: RawData,
    currentVideoData: { videoItag: number; audioItag: number },
    type: "live",
): StreamInfo[];
function chooseVideoFormats(
    data: RawData,
    currentVideoData: { videoItag: number; audioItag: number },
    type: "live" | "video",
): YoutubeVideoFormat[] | StreamInfo[] {
    if (type === "video") {
        const formats = data.streamingData.adaptiveFormats
            .filter((format) => {
                return format.itag && format.height && format.contentLength && format.mimeType;
            })
            .map((format) => ({
                formatId: format.itag,
                height: format.height,
                sizeBytes: Number.parseInt(format.contentLength || "0", 10),
                codecFamily: extractVideoCodec(format.mimeType),
            }));

        const { videoItag } = currentVideoData;
        const codecFamily = getVideoCodecFamily(videoItag);

        console.log(
            `Current video quality itag: ${videoItag}, determined codec family: ${codecFamily}`,
        );

        const result = formats
            .filter((format) => {
                if (!format.codecFamily) return false;
                return format.codecFamily === codecFamily;
            })
            .map((format) => {
                const result = format;
                delete result.codecFamily;
                return result;
            })
            .sort((a, b) => b.height - a.height) satisfies YoutubeVideoFormat[];
        console.log("Chosen video formats after filtering by codec family:", result);
        return result;
    } else {
        const formats = data.streamingData.adaptiveFormats
            .filter((format) => {
                return format.itag && format.height && format.contentLength && format.mimeType;
            })
            .map((format) => ({
                formatId: format.itag,
                resolution: format.height,
                sizePerSecondBytes: Number.parseInt(format.contentLength || "0", 10) / 3600,
                codecFamily: extractVideoCodec(format.mimeType),
            }));

        const { videoItag } = currentVideoData;
        const codecFamily = getVideoCodecFamily(videoItag);

        return formats
            .filter((format) => {
                if (!format.codecFamily) return false;
                return format.codecFamily === codecFamily;
            })
            .map((format) => {
                const result = format;
                delete result.codecFamily;
                return result;
            }) satisfies StreamInfo[];
    }
}

function chooseAudioFormats(data: RawData) {
    return data.videoDetails.isLive
        ? data.streamingData.adaptiveFormats
              .filter((format) => format.itag === CONFIG.LIVE_AUDIO_ITAG)
              .map((format) => {
                  return {
                      formatId: format.itag,
                      sizeBytes: format.bitrate ? (format.bitrate * 3600) / 8 : 0,
                      codecFamily: extractAudioCodec(format.mimeType),
                  };
              })
        : data.streamingData.adaptiveFormats
              .filter((format) => {
                  return format.itag === CONFIG.AUDIO_ITAG;
              })
              .map((format) => {
                  return {
                      formatId: format.itag,
                      sizeBytes: Number.parseInt(format.contentLength || "0", 10),
                      codecFamily: extractAudioCodec(format.mimeType),
                  };
              });
}

export function getYoutubeVideoData(
    data: RawData,
    currentVideoData: { videoItag: number; audioItag: number },
): YoutubeVideoFormat[] {
    const videoFormats = chooseVideoFormats(data, currentVideoData, "video");
    const formats = {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        durationSeconds: Number.parseInt(data.videoDetails.lengthSeconds || "0", 10),
        videoFormats,
        audioFormats: chooseAudioFormats(data),
        isLive: data.videoDetails.isLive ?? false,
    };

    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(videoFormats, audioSize, "video");
    return mergedFormats;
}

export function getYoutubeLiveData(
    data: RawData,
    currentVideoData: { videoItag: number; audioItag: number },
): StreamInfo[] {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    const formats = {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        durationSeconds: Number.parseInt(data.videoDetails.lengthSeconds || "0", 10),
        videoFormats: chooseVideoFormats(data, currentVideoData, "live"),
        audioFormats: chooseAudioFormats(data),
        isLive: data.videoDetails.isLive ?? false,
    };

    const mergedFormats = mergeAudioWithVideo(
        formats.videoFormats,
        formats.audioFormats[0].sizeBytes,
        "live",
    );

    return mergedFormats;
}

type MainWorldResponse = {
    source: "tubesize-main";
    type: "getVideoStats";
    data: Partial<YoutubeVideoStats> | undefined;
};

export async function getVideoStats(): Promise<YoutubeVideoStats> {
    const VIDEO_STATS_RETRY_ATTEMPTS = 10;
    const VIDEO_STATS_RETRY_DELAY_MS = 500;

    for (let attempt = 1; attempt <= VIDEO_STATS_RETRY_ATTEMPTS; attempt++) {
        try {
            const stats = await requestVideoStats();
            if (hasVideoItags(stats)) return stats;
        } catch {}
        if (attempt < VIDEO_STATS_RETRY_ATTEMPTS) {
            await new Promise((resolve) =>
                globalThis.setTimeout(resolve, VIDEO_STATS_RETRY_DELAY_MS),
            );
        }
    }

    throw new Error("Failed to retrieve video stats");
}

function requestVideoStats(): Promise<Partial<YoutubeVideoStats> | undefined> {
    return new Promise((resolve, reject) => {
        const timeoutId = globalThis.setTimeout(() => {
            window.removeEventListener("message", handleMessage);
            reject(new Error("Timed out waiting for YouTube video stats"));
        }, 10_000);

        function handleMessage(event: MessageEvent) {
            // eslint-disable-next-line unicorn/prefer-global-this
            if (event.source !== window) return;
            const message = event.data as MainWorldResponse;
            if (message?.source !== "tubesize-main" || message?.type !== "getVideoStats") return;

            globalThis.clearTimeout(timeoutId);
            window.removeEventListener("message", handleMessage);

            const stats = message.data;
            resolve(stats);
        }

        window.addEventListener("message", handleMessage);
        window.postMessage({
            source: "tubesize-content",
            type: "getVideoStats",
        });
    });
}

function hasVideoItags(stats: Partial<YoutubeVideoStats> | undefined): stats is YoutubeVideoStats {
    return Boolean(stats?.fmt && stats.afmt);
}

type CurrentVideoItags = { videoItag: number; audioItag: number };

type YoutubeVideoStats = { fmt: string; afmt: string };

export async function getCurrentItag(): Promise<CurrentVideoItags> {
    const stats = await getVideoStats();
    return {
        videoItag: Number(stats.fmt),
        audioItag: Number(stats.afmt),
    };
}

const videoCodecsByQualityMap = new Map<string, Map<number, Array<number>>>([
    [
        "AV1",
        new Map([
            [4320, [402, 571]],
            [2160, [401, 701]],
            [1440, [400, 700]],
            [1080, [399, 699]],
            [720, [398, 698]],
            [480, [397, 697, 788]],
            [360, [396, 696]],
            [240, [395, 695]],
            [144, [394, 694]],
        ]),
    ],
    [
        "VP9",
        new Map([
            [4320, [272]],
            [2160, [337, 315, 313]],
            [1440, [336, 308, 271]],
            [1080, [335, 303, 248]],
            [720, [334, 302, 247]],
            [480, [333, 244, 779, 780]],
            [360, [332, 243]],
            [240, [331, 242]],
            [144, [330, 278]],
        ]),
    ],
    [
        "H.264",
        new Map([
            [4320, [138]],
            [2160, [305, 266]],
            [1440, [304, 264]],
            [1080, [299, 137]],
            [720, [298, 136]],
            [480, [135]],
            [360, [134, 18]],
            [240, [133]],
            [144, [160]],
        ]),
    ],
    [
        "VP8",
        new Map([
            [1080, [170]],
            [720, [169]],
            [480, [168]],
            [360, [167]],
        ]),
    ],
]);
const audioCodecsMap = new Map<string, Array<number>>([
    ["opus", [251, 250, 249]],
    ["mp4a.40.2", [140, 18]],
]);

export function getVideoCodecFamily(videoItag: number): VideoCodecFamilies {
    for (const [codec, qualityItagsMap] of videoCodecsByQualityMap) {
        for (const [_quality, itags] of qualityItagsMap) {
            for (const itag of itags) {
                if (itag === videoItag) return codec as VideoCodecFamilies;
            }
        }
    }
    throw new Error("Unknown video codec");
}

export function getAudioCodecFamily(audioItag: number): AudioCodecFamilies {
    // eslint-disable-next-line unicorn/no-array-for-each
    audioCodecsMap.forEach((itags, codec) => {
        for (const itag of itags) {
            if (itag === audioItag) return codec as AudioCodecFamilies;
        }
    });

    throw new Error("Unknown audio codec");
}
