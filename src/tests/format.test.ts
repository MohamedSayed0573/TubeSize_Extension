import { describe, expect, test } from "bun:test";

import { toDateKey } from "@lib/dateUtils";
import {
    audioDisplaySizes,
    formatAudioCodec,
    formatBadge,
    formatBitrate,
    formatBytes,
    formatCodec,
    formatDate,
    formatDisplaySizes,
    formatRate,
} from "@lib/format";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";

// Intl.DateTimeFormat.formatRange uses narrow no-break spaces (U+2009) around
// the range separator in Node.js, but regular spaces in Bun. Normalize so the
// test passes on both runtimes.
function normalizeRange(value: string) {
    return value.replaceAll("\u2009", " ").replaceAll("\u00A0", " ").replaceAll("\u202F", " ");
}

describe("formatBytes", () => {
    test("formats zero bytes", () => {
        expect(formatBytes(0)).toBe("0 B");
    });

    test("uses decimal SI units by default", () => {
        expect(formatBytes(1000)).toBe("1 KB");
        expect(formatBytes(1500)).toBe("1.5 KB");
    });

    test("rounds to two decimal places by default", () => {
        expect(formatBytes(1234)).toBe("1.23 KB");
    });

    test("allows options to override the defaults", () => {
        expect(formatBytes(1024, { base: 2, standard: "iec" })).toBe("1 KiB");
        expect(formatBytes(1500, { round: 0 })).toBe("2 KB");
    });
});

describe("formatRate", () => {
    test("formats a per-hour rate", () => {
        expect(formatRate(1_000_000, "hour")).toBe("3.6 GB/hour");
    });

    test("formats a per-minute rate", () => {
        expect(formatRate(1_000_000, "minute")).toBe("60 MB/min");
    });

    test("scales small rates into smaller units", () => {
        expect(formatRate(1000, "minute")).toBe("60 KB/min");
    });
});

describe("formatCodec", () => {
    test("maps codec identifiers to display names", () => {
        expect(formatCodec("av01")).toBe("AV1");
        expect(formatCodec("vp9")).toBe("VP9");
        expect(formatCodec("avc")).toBe("H.264");
    });
});

describe("formatAudioCodec", () => {
    test("maps audio codec identifiers to display names", () => {
        expect(formatAudioCodec("opus")).toBe("Opus");
        expect(formatAudioCodec("aac")).toBe("AAC");
        expect(formatAudioCodec("vorbis")).toBe("Vorbis");
    });
});

describe("formatBitrate", () => {
    test("uses bps below one kilobit per second", () => {
        expect(formatBitrate(320)).toBe("320 bps");
    });

    test("uses kbps below one megabit per second", () => {
        expect(formatBitrate(146_084)).toBe("146 kbps");
    });

    test("uses Mbps with one decimal above one megabit per second", () => {
        expect(formatBitrate(1_200_000)).toBe("1.2 Mbps");
    });
});

describe("formatDate", () => {
    const may15 = toDateKey("2023-05-15")!;
    const may16 = toDateKey("2023-05-16")!;

    test("Should return formatted date if the input is not array", () => {
        expect(formatDate(may15)).toBe("May 15, 2023");
    });

    test("Should return formatted date range if the input is array", () => {
        expect(normalizeRange(formatDate([may15, may16]))).toBe("May 15 – 16, 2023");
    });

    test("Should return single date if the input array has the same start and end date", () => {
        expect(formatDate([may15, may15])).toBe("May 15, 2023");
    });

    test("Should throw if the input array is empty", () => {
        expect(() => formatDate([])).toThrow();
    });
});

describe("formatBadge", () => {
    test("formats raw bytes", () => {
        expect(formatBadge(999)).toBe("999B");
    });

    test("formats kilobytes", () => {
        expect(formatBadge(12_000)).toBe("12K");
    });

    test("formats megabytes", () => {
        expect(formatBadge(2_400_000)).toBe("2M");
    });

    test("formats gigabytes", () => {
        expect(formatBadge(2_400_000_000)).toBe("2.4G");
    });
});

const vodAudio: AudioStreamInfo = {
    formatId: 251,
    codec: "opus",
    bitrate: 8000,
    sizeBytes: 500_000,
    bytesPerSecond: 8000 / 8,
    itags: [],
};
const liveAudio: AudioStreamInfo = {
    formatId: 140,
    codec: "aac",
    bitrate: 8000,
    sizeBytes: 3_600_000,
    bytesPerSecond: 3_600_000 / 3600,
    itags: [],
};

const vodFormat: DisplayFormat = {
    kind: "vod",
    key: 399,
    resolution: 1080,
    sizeBytes: 2_000_000,
    sizePerSecondBytes: 2000,
};

const liveFormat: DisplayFormat = {
    kind: "live",
    key: 1080,
    resolution: 1080,
    sizePerSecondBytes: 2000,
};

describe("audioDisplaySizes", () => {
    test("formats VOD audio as total bytes with no secondary rate", () => {
        expect(audioDisplaySizes(vodAudio, "vod", false)).toEqual({
            primary: "500 KB",
        });
    });

    test("formats live audio as per-hour primary and per-minute secondary", () => {
        expect(audioDisplaySizes(liveAudio, "live", false)).toEqual({
            primary: "3.6 MB/hour",
            secondary: "60 KB/min",
        });
    });

    test("hides the secondary rate when hideRate is true", () => {
        expect(audioDisplaySizes(liveAudio, "live", true)).toEqual({
            primary: "3.6 MB/hour",
            secondary: undefined,
        });
    });
});

describe("formatDisplaySizes", () => {
    test("formats a VOD with total size and per-minute rate", () => {
        expect(formatDisplaySizes(vodFormat)).toEqual({
            primary: "2 MB",
            secondary: "120 KB/min",
        });
    });

    test("formats a live stream with per-hour and per-minute rates", () => {
        expect(formatDisplaySizes(liveFormat)).toEqual({
            primary: "7.2 MB/hour",
            secondary: "120 KB/min",
        });
    });

    test("hides the secondary rate for shorts", () => {
        const shorts: DisplayFormat = { ...vodFormat, hideRate: true };
        expect(formatDisplaySizes(shorts).secondary).toBeUndefined();
    });
});
