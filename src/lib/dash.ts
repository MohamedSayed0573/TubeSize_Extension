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

function parseIsoSeconds(iso: string, allowZero: boolean): number | undefined {
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

    if (!Number.isFinite(total)) return undefined;
    return allowZero ? (total >= 0 ? total : undefined) : total > 0 ? total : undefined;
}

export function parseIsoDuration(iso: string): number | undefined {
    return parseIsoSeconds(iso, false);
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
    start?: number;
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

function resolvePeriodDurations(
    periods: ParsedDashPeriod[],
    totalDuration: number,
    mpdDuration: number | undefined,
): number[] {
    if (periods.length === 0) return [];

    const durations = periods.map((period) => period.duration);
    const totalBoundary = mpdDuration ?? (totalDuration > 0 ? totalDuration : undefined);

    for (let index = 0; index < periods.length; index++) {
        if (durations[index] !== undefined) continue;
        const start = periods[index]?.start;
        if (start === undefined) continue;
        const nextStart = periods[index + 1]?.start ?? totalBoundary;
        if (nextStart !== undefined && nextStart > start) {
            durations[index] = nextStart - start;
        }
    }

    if (!(totalDuration > 0)) {
        return durations.map((duration) => duration ?? 0);
    }

    let knownSum = 0;
    let unknownCount = 0;
    for (const duration of durations) {
        if (duration !== undefined) knownSum += duration;
        else unknownCount++;
    }

    if (unknownCount === 0 && knownSum > 0) {
        const scale = totalDuration / knownSum;
        return durations.map((duration) => (duration ?? 0) * scale);
    }

    if (unknownCount > 0 && knownSum < totalDuration) {
        const share = (totalDuration - knownSum) / unknownCount;
        return durations.map((duration) => duration ?? share);
    }

    const equalShare = totalDuration / periods.length;
    return periods.map(() => equalShare);
}

function selectPeriodVideoForResolution(
    periodVideos: Map<number, DashVideoCandidate>,
    targetResolution: number,
): DashVideoCandidate | undefined {
    const exact = periodVideos.get(targetResolution);
    if (exact) return exact;
    if (periodVideos.size === 0) return undefined;

    const sorted = [...periodVideos.values()].toSorted((a, b) => b.resolution - a.resolution);
    const lowerOrEqual = sorted.find((candidate) => candidate.resolution <= targetResolution);
    return lowerOrEqual ?? sorted.at(-1);
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
    const periods: ParsedDashPeriod[] = [];
    if (periodNodes.length > 0) {
        periodNodes.each((_, periodNode) => {
            const period = $(periodNode);
            const parsed = parseAdaptationSets($, period);
            periods.push({
                start: parseIsoSeconds(period.attr("start") ?? "", true),
                duration: parseIsoDuration(period.attr("duration") ?? ""),
                videos: parsed.videos,
                audio: parsed.audio,
            });
        });
    } else {
        const parsed = parseAdaptationSets($, mpd);
        periods.push({
            videos: parsed.videos,
            audio: parsed.audio,
        });
    }

    let periodDurationSum = 0;
    for (let index = 0; index < periods.length; index++) {
        const period = periods[index]!;
        if (period.duration !== undefined) {
            periodDurationSum += period.duration;
        } else if (period.start !== undefined) {
            const nextStart = periods[index + 1]?.start ?? mpdDuration;
            if (nextStart !== undefined && nextStart > period.start) {
                periodDurationSum += nextStart - period.start;
            }
        }
    }

    const durationSeconds =
        explicitDuration ?? mpdDuration ?? (periodDurationSum > 0 ? periodDurationSum : 0);

    const isVod = (mpdType !== "dynamic" && durationSeconds > 0) || explicitDuration !== undefined;
    const titleMeta = options.title ? { title: options.title } : {};

    if (isVod) {
        const periodDurations = resolvePeriodDurations(periods, durationSeconds, mpdDuration);
        const allResolutions = new Set<number>();
        for (const period of periods) {
            for (const resolution of period.videos.keys()) {
                allResolutions.add(resolution);
            }
        }

        const hasResolvedHeight = [...allResolutions].some((resolution) => resolution > 0);
        const resolutions = [...allResolutions]
            .filter((resolution) => !hasResolvedHeight || resolution > 0)
            .toSorted((a, b) => b - a);

        if (resolutions.length === 0) {
            throw new MediaEstimateError("no_formats", "No video formats found in DASH manifest");
        }

        const formats: VodMediaFormat[] = resolutions.map((resolution) => {
            let totalBytes = 0;
            let dominant: DashVideoCandidate | undefined;
            let dominantBytes = -1;

            for (let index = 0; index < periods.length; index++) {
                const period = periods[index]!;
                const periodDuration = periodDurations[index] ?? 0;
                if (!(periodDuration > 0)) continue;

                const candidate = selectPeriodVideoForResolution(period.videos, resolution);
                if (!candidate) continue;

                const periodBytes = (candidate.bandwidth / 8) * periodDuration;
                totalBytes += periodBytes;
                if (periodBytes > dominantBytes) {
                    dominantBytes = periodBytes;
                    dominant = candidate;
                }
            }

            return {
                kind: "vod",
                resolution,
                sizePerSecondBytes: durationSeconds > 0 ? totalBytes / durationSeconds : 0,
                sizeBytes: Math.round(totalBytes),
                ...(dominant?.fps !== undefined ? { fps: dominant.fps } : {}),
                ...(dominant?.codec ? { codec: dominant.codec } : {}),
            };
        });

        let totalAudioBytes = 0;
        let hasAudio = false;
        let dominantAudioCodec: AudioCodec | undefined;
        let dominantAudioBytes = -1;

        for (let index = 0; index < periods.length; index++) {
            const period = periods[index]!;
            const periodDuration = periodDurations[index] ?? 0;
            if (!period.audio || !(periodDuration > 0)) continue;

            hasAudio = true;
            const periodBytes = (period.audio.bandwidth / 8) * periodDuration;
            totalAudioBytes += periodBytes;
            if (periodBytes > dominantAudioBytes) {
                dominantAudioBytes = periodBytes;
                dominantAudioCodec = period.audio.codec;
            }
        }

        let audio: AudioStreamInfo | undefined;
        if (hasAudio && totalAudioBytes > 0) {
            const bytesPerSecond = durationSeconds > 0 ? totalAudioBytes / durationSeconds : 0;
            audio = {
                formatId: 0,
                ...(dominantAudioCodec ? { codec: dominantAudioCodec } : {}),
                bitrate: Math.round(bytesPerSecond * 8),
                bytesPerSecond,
                sizeBytes: Math.round(totalAudioBytes),
                itags: [],
            };
        }

        return {
            platform: "generic",
            contentType: "vod",
            ...titleMeta,
            ...(audio ? { audio } : {}),
            durationSeconds,
            formats,
        };
    }

    const reversedPeriods = periods.toReversed();
    const activePeriod = reversedPeriods.find((period) => period.videos.size > 0);
    if (!activePeriod) {
        throw new MediaEstimateError("no_formats", "No video formats found in DASH manifest");
    }

    const videos = [...activePeriod.videos.values()].toSorted(
        (a, b) => b.resolution - a.resolution,
    );
    const liveAudio = activePeriod.audio ?? reversedPeriods.find((period) => period.audio)?.audio;

    let audio: AudioStreamInfo | undefined;
    if (liveAudio) {
        const bytesPerSecond = liveAudio.bandwidth / 8;
        audio = {
            formatId: 0,
            ...(liveAudio.codec ? { codec: liveAudio.codec } : {}),
            bitrate: liveAudio.bandwidth,
            bytesPerSecond,
            sizeBytes: Math.round(bytesPerSecond * 3600),
            itags: [],
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
