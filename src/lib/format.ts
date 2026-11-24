import type { AudioCodec, VideoCodec } from "@app-types/platforms.types";
import type { DateKey } from "@app-types/types";
import { filesize, type FilesizeOptions } from "filesize";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";
import { getLanguage } from "@/i18n/language";

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

export function formatRate(bytesPerSecond: number, per: "hour" | "minute"): string {
    const seconds = per === "hour" ? 3600 : 60;
    const suffix = per === "hour" ? "hour" : "min";
    return `${formatBytes(bytesPerSecond * seconds)}/${suffix}`;
}

export function megabytesPerHour(bytesPerSecond: number): number {
    return (bytesPerSecond * 3600) / 1_000_000;
}

export function formatCodec(codec: VideoCodec) {
    const labels: Record<VideoCodec, string> = {
        av01: "AV1",
        vp9: "VP9",
        avc: "H.264",
    };
    return labels[codec];
}

export function formatAudioCodec(codec: AudioCodec) {
    const labels: Record<AudioCodec, string> = {
        opus: "Opus",
        aac: "AAC",
        vorbis: "Vorbis",
    };
    return labels[codec];
}

export function formatBitrate(bitsPerSecond: number) {
    if (bitsPerSecond < 1000) return `${Math.round(bitsPerSecond)} bps`;
    if (bitsPerSecond < 1_000_000) return `${Math.round(bitsPerSecond / 1000)} kbps`;
    return `${(bitsPerSecond / 1_000_000).toFixed(1)} Mbps`;
}

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

export function formatBadge(bytes: number) {
    if (bytes < 1000) return `${bytes}B`;
    if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(0)}K`;
    if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(0)}M`;
    return `${(bytes / 1_000_000_000).toFixed(1)}G`;
}

export function audioDisplaySizes(
    audio: AudioStreamInfo,
    kind: "vod" | "live",
    hideRate: boolean,
): { primary: string; secondary?: string } {
    if (kind === "vod") {
        return { primary: formatBytes(audio.sizeBytes) };
    }

    return {
        primary: formatRate(audio.bytesPerSecond, "hour"),
        secondary: hideRate ? undefined : formatRate(audio.bytesPerSecond, "minute"),
    };
}

export function formatDisplaySizes(format: DisplayFormat) {
    if (format.kind === "vod") {
        return {
            primary: formatBytes(format.sizeBytes),
            secondary: format.hideRate
                ? undefined
                : formatRate(format.sizePerSecondBytes, "minute"),
        };
    }

    return {
        primary: formatRate(format.sizePerSecondBytes, "hour"),
        secondary: formatRate(format.sizePerSecondBytes, "minute"),
    };
}
