import type {
    AudioCodec,
    AudioStreamInfo,
    LiveMediaFormat,
    MediaEstimate,
    VideoCodec,
    VodMediaFormat,
} from "@app-types/platforms.types";
import { fetchBoundedText, MediaEstimateError } from "@lib/mediaEstimateError";
import type { FetchLike } from "@lib/utils";
import * as cheerio from "cheerio";

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const ISO_DURATION_REGEX =
    /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i;

export type GenericDashOptions = {
    durationSeconds?: number;
    title?: string;
    fetch?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    timeoutMs?: number;
    maxManifestBytes?: number;
};

function parseIsoDuration(iso: string): number | undefined {
    const trimmed = iso.trim();
    const match = ISO_DURATION_REGEX.exec(trimmed);
    if (!match) return undefined;

    const [, daysStr, hoursStr, minutesStr, secondsStr] = match;
    if (!daysStr && !hoursStr && !minutesStr && !secondsStr) return undefined;

    const days = daysStr ? Number(daysStr) : 0;
    const hours = hoursStr ? Number(hoursStr) : 0;
    const minutes = minutesStr ? Number(minutesStr) : 0;
    const seconds = secondsStr ? Number(secondsStr) : 0;
    const total = days * 86_400 + hours * 3_600 + minutes * 60 + seconds;

    return Number.isFinite(total) && total > 0 ? total : undefined;
}

function parseFrameRate(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const trimmed = raw.trim();
    if (!trimmed) return undefined;

    const slashIndex = trimmed.indexOf("/");
    let fps: number;
    if (slashIndex > 0) {
        const numerator = Number(trimmed.slice(0, slashIndex));
        const denominator = Number(trimmed.slice(slashIndex + 1));
        if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
            return undefined;
        }
        fps = numerator / denominator;
    } else {
        fps = Number(trimmed);
    }

    if (!Number.isFinite(fps) || fps <= 0) return undefined;
    return Math.round(fps);
}

function parseVideoCodec(codecs: string | undefined): VideoCodec | undefined {
    if (!codecs) return undefined;
    const lower = codecs.toLowerCase();
    if (lower.includes("av01")) return "av01";
    if (lower.includes("vp9") || lower.includes("vp09")) return "vp9";
    if (lower.includes("avc1") || lower.includes("avc3")) return "avc";
    return undefined;
}

function parseAudioCodec(codecs: string | undefined): AudioCodec | undefined {
    if (!codecs) return undefined;
    const lower = codecs.toLowerCase();
    if (lower.includes("opus")) return "opus";
    if (lower.includes("mp4a")) return "aac";
    if (lower.includes("vorbis")) return "vorbis";
    return undefined;
}

function parsePositiveNumber(raw: string | undefined): number | undefined {
    if (!raw) return undefined;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

type DashVideoCandidate = {
    resolution: number;
    bandwidth: number;
    fps?: number;
    codec?: VideoCodec;
};

type DashAudioCandidate = {
    bandwidth: number;
    codec?: AudioCodec;
};

type ParsedDashPeriod = {
    duration?: number;
    videos: Map<number, DashVideoCandidate>;
    audio?: DashAudioCandidate;
};

function parseAdaptationSets(
    $: cheerio.CheerioAPI,
    container: ReturnType<cheerio.CheerioAPI>,
): { videos: Map<number, DashVideoCandidate>; audio?: DashAudioCandidate } {
    const videoByResolution = new Map<number, DashVideoCandidate>();
    let bestAudio: DashAudioCandidate | undefined;

    container.find("AdaptationSet").each((_, adaptationNode) => {
        const adaptationSet = $(adaptationNode);
        const setContentType = adaptationSet.attr("contentType")?.toLowerCase();
        const setMimeType = adaptationSet.attr("mimeType")?.toLowerCase();
        const setHeight = parsePositiveNumber(adaptationSet.attr("height"));
        const setFrameRate = adaptationSet.attr("frameRate");
        const setCodecs = adaptationSet.attr("codecs");

        adaptationSet.find("Representation").each((__, repNode) => {
            const rep = $(repNode);
            const bandwidth = parsePositiveNumber(rep.attr("bandwidth"));
            if (!bandwidth) return;

            const repMimeType = rep.attr("mimeType")?.toLowerCase() ?? setMimeType;
            const repHeight = parsePositiveNumber(rep.attr("height")) ?? setHeight;
            const repWidth = parsePositiveNumber(rep.attr("width"));
            const codecs = rep.attr("codecs") ?? setCodecs;

            const isAudio = setContentType === "audio" || repMimeType?.startsWith("audio/");
            const isVideo =
                !isAudio &&
                (setContentType === "video" ||
                    repMimeType?.startsWith("video/") ||
                    repHeight !== undefined ||
                    repWidth !== undefined);

            if (isAudio) {
                if (!bestAudio || bandwidth > bestAudio.bandwidth) {
                    bestAudio = { bandwidth, codec: parseAudioCodec(codecs) };
                }
                return;
            }

            if (!isVideo) return;

            const resolution = repHeight ?? 0;
            const fps = parseFrameRate(rep.attr("frameRate") ?? setFrameRate);
            const codec = parseVideoCodec(codecs);
            const existing = videoByResolution.get(resolution);
            if (!existing || bandwidth > existing.bandwidth) {
                videoByResolution.set(resolution, {
                    resolution,
                    bandwidth,
                    ...(fps !== undefined ? { fps } : {}),
                    ...(codec ? { codec } : {}),
                });
            }
        });
    });

    const hasResolvedHeight = [...videoByResolution.keys()].some((resolution) => resolution > 0);
    if (hasResolvedHeight) {
        videoByResolution.delete(0);
    }

    return { videos: videoByResolution, audio: bestAudio };
}

export async function estimateGenericDash(
    url: string,
    options: GenericDashOptions = {},
): Promise<MediaEstimate> {
    const fetchFn = options.fetch ?? defaultFetch;
    const { text: xml } = await fetchBoundedText(url, {
        fetch: fetchFn,
        sleep: options.sleep,
        init: { cache: "no-store", credentials: "include" },
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxManifestBytes,
        fetchErrorPrefix: "Error fetching DASH manifest",
        readErrorPrefix: "Error reading DASH manifest",
    });

    const $ = cheerio.load(xml, { xml: true });
    const mpd = $("MPD").first().length > 0 ? $("MPD").first() : $("mpd").first();
    if (mpd.length === 0) {
        throw new MediaEstimateError("no_formats", "Invalid DASH MPD manifest");
    }

    const mpdType = (mpd.attr("type") ?? "static").toLowerCase();
    const explicitDuration =
        options.durationSeconds !== undefined &&
        Number.isFinite(options.durationSeconds) &&
        options.durationSeconds > 0
            ? options.durationSeconds
            : undefined;
    const mpdDuration = parseIsoDuration(mpd.attr("mediaPresentationDuration") ?? "");

    const periodNodes = mpd.find("Period");
    let selectedPeriod: ParsedDashPeriod | undefined;
    let fallbackAudio: DashAudioCandidate | undefined;

    if (periodNodes.length > 0) {
        periodNodes.each((_, periodNode) => {
            const period = $(periodNode);
            const parsed = parseAdaptationSets($, period);
            if (!fallbackAudio && parsed.audio) {
                fallbackAudio = parsed.audio;
            }
            if (!selectedPeriod && parsed.videos.size > 0) {
                selectedPeriod = {
                    duration: parseIsoDuration(period.attr("duration") ?? ""),
                    videos: parsed.videos,
                    audio: parsed.audio,
                };
            }
        });
    } else {
        const parsed = parseAdaptationSets($, mpd);
        if (parsed.videos.size > 0) {
            selectedPeriod = {
                videos: parsed.videos,
                audio: parsed.audio,
            };
        }
    }

    if (!selectedPeriod) {
        throw new MediaEstimateError("no_formats", "No video formats found in DASH manifest");
    }

    const isStatic = mpdType !== "dynamic";
    const durationSeconds = explicitDuration ?? mpdDuration ?? selectedPeriod.duration ?? 0;
    const isVod = (isStatic && durationSeconds > 0) || explicitDuration !== undefined;
    const titleMeta = options.title ? { title: options.title } : {};
    const videos = [...selectedPeriod.videos.values()].toSorted(
        (a, b) => b.resolution - a.resolution,
    );
    const selectedAudio = selectedPeriod.audio ?? fallbackAudio;

    let audio: AudioStreamInfo | undefined;
    if (selectedAudio) {
        const bytesPerSecond = selectedAudio.bandwidth / 8;
        audio = {
            formatId: 0,
            ...(selectedAudio.codec ? { codec: selectedAudio.codec } : {}),
            bitrate: selectedAudio.bandwidth,
            bytesPerSecond,
            sizeBytes: Math.round(bytesPerSecond * (isVod ? durationSeconds : 3600)),
            itags: [],
        };
    }

    if (isVod) {
        const formats: VodMediaFormat[] = videos.map((video) => {
            const sizePerSecondBytes = video.bandwidth / 8;
            return {
                kind: "vod",
                resolution: video.resolution,
                sizePerSecondBytes,
                sizeBytes: Math.round(sizePerSecondBytes * durationSeconds),
                ...(video.fps !== undefined ? { fps: video.fps } : {}),
                ...(video.codec ? { codec: video.codec } : {}),
            };
        });

        return {
            platform: "generic",
            contentType: "vod",
            ...titleMeta,
            ...(audio ? { audio } : {}),
            durationSeconds,
            formats,
        };
    }

    const formats: LiveMediaFormat[] = videos.map((video) => ({
        kind: "live",
        resolution: video.resolution,
        sizePerSecondBytes: video.bandwidth / 8,
        ...(video.fps !== undefined ? { fps: video.fps } : {}),
        ...(video.codec ? { codec: video.codec } : {}),
    }));

    return {
        platform: "generic",
        contentType: "live",
        ...titleMeta,
        ...(audio ? { audio } : {}),
        formats,
    };
}
