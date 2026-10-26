import type { AudioCodec, VideoCodec } from "@app-types/platforms.types";
import type { DateKey } from "@app-types/types";
import { filesize, type FilesizeOptions } from "filesize";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";
import { getLanguage } from "@/i18n/language";

/**
 * Formats bytes as a human-readable string using decimal SI units (1000-based).
 * @example formatBytes(1000) returns "1 KB"
 */
export function formatBytes(bytes: number, options?: FilesizeOptions) {
    const [value, unit] = filesize(bytes, {
        base: 10,
        standard: "si",
        round: 2,
        ...options,
    }).split(" ");

    const formattedUnit = options?.standard === "iec" ? unit : unit!.toUpperCase();
    return `${value} ${formattedUnit}`;
}

/**
 * Formats a bytes-per-second rate against the given time basis.
 * @example formatRate(1_000_000, "hour") returns "3.6 GB/hour"
 * @example formatRate(1_000_000, "minute") returns "60 MB/min"
 */
export function formatRate(bytesPerSecond: number, per: "hour" | "minute"): string {
    const seconds = per === "hour" ? 3600 : 60;
    const suffix = per === "hour" ? "hour" : "min";
    return `${formatBytes(bytesPerSecond * seconds)}/${suffix}`;
}

/**
 * Converts a bytes-per-second rate to decimal megabytes per hour (SI).
 * @example megabytesPerHour(1_000_000) returns 3600
 */
export function megabytesPerHour(bytesPerSecond: number): number {
    return (bytesPerSecond * 3600) / 1_000_000;
}

/**
 * Formats a video codec identifier for display.
 * @example formatCodec("avc") returns "H.264"
 */
export function formatCodec(codec: VideoCodec) {
    const labels: Record<VideoCodec, string> = {
        av01: "AV1",
        vp9: "VP9",
        avc: "H.264",
    };
    return labels[codec];
}

/**
 * Formats an audio codec identifier for display.
 * @example formatAudioCodec("opus") returns "Opus"
 */
export function formatAudioCodec(codec: AudioCodec) {
    const labels: Record<AudioCodec, string> = {
        opus: "Opus",
        aac: "AAC",
        vorbis: "Vorbis",
    };
    return labels[codec];
}

/**
 * Formats a bits-per-second rate using decimal SI prefixes (1000-based).
 * @example formatBitrate(146_084) returns "146 kbps"
 * @example formatBitrate(1_200_000) returns "1.2 Mbps"
 */
export function formatBitrate(bitsPerSecond: number) {
    if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} bps`;
    if (bitsPerSecond < 1_000_000) return `${Math.round(bitsPerSecond / 1000)} kbps`;
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
}

/**
 * Formats a date or date range into a human-readable string.
 * @example "2023-05-15" -> "May 15, 2023"
 * @example ["2023-05-15", "2023-05-16"] -> "May 15 – 16, 2023"
 */
export function formatDate(date: DateKey | DateKey[]) {
    const dtf = new Intl.DateTimeFormat(getLanguage(), {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    // Appending "T00:00:00" parses as local midnight; a bare "YYYY-MM-DD"
    // would be parsed as UTC midnight.
    if (Array.isArray(date)) {
        if (date.length === 0) throw new Error("formatDate expected a non-empty date array");

        const dates = date.map((key) => new Date(`${key}T00:00:00`));
        const sortedDates = dates.toSorted((a, b) => a.getTime() - b.getTime());
        return dtf.formatRange(sortedDates[0]!, sortedDates.at(-1)!);
    }

    return dtf.format(new Date(`${date}T00:00:00`));
}

/**
 * Formats bytes for the compact action badge using decimal SI units (1000-based).
 * @example formatBadge(2_400_000) returns "2M"
 */
export function formatBadge(bytes: number) {
    if (bytes < 1000) return `${bytes}B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)}K`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(0)}M`;
    return `${(bytes / 1_000_000_000).toFixed(1)}G`;
}

function audioBytesPerSecond(audio: AudioStreamInfo | undefined, includeAudio: boolean): number {
    if (includeAudio || !audio || audio.bitrate === undefined) return 0;
    return audio.bitrate / 8;
}

/** The audio stream's share of a VOD's total `sizeBytes`. */
function audioTotalBytes(audio: AudioStreamInfo | undefined, includeAudio: boolean): number {
    if (includeAudio || !audio || audio.sizeBytes === undefined) return 0;
    return audio.sizeBytes;
}

export function formatDisplaySizes(
    format: DisplayFormat,
    audio: AudioStreamInfo | undefined,
    includeAudio: boolean,
) {
    const perSecond = Math.max(
        format.sizePerSecondBytes - audioBytesPerSecond(audio, includeAudio),
        0,
    );

    if (format.kind === "vod") {
        const total = Math.max(format.sizeBytes - audioTotalBytes(audio, includeAudio), 0);
        return {
            primary: formatBytes(total),
            secondary: format.hideRate ? undefined : formatRate(perSecond, "minute"),
        };
    }

    return {
        primary: formatRate(perSecond, "hour"),
        secondary: formatRate(perSecond, "minute"),
    };
}
