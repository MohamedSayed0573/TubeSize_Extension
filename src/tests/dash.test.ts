import { describe, expect, test } from "bun:test";

import { estimateGenericDash, parseIsoDuration } from "@lib/dash";

const instantSleep = async () => {};

describe("parseIsoDuration", () => {
    test("parses valid ISO 8601 durations including fractional seconds and days", () => {
        expect(parseIsoDuration("PT1H2M3.5S")).toBe(3723.5);
        expect(parseIsoDuration("PT45S")).toBe(45);
        expect(parseIsoDuration("PT10M")).toBe(600);
        expect(parseIsoDuration("P1DT2H")).toBe(93_600);
        expect(parseIsoDuration(" pt0h5m30s ")).toBe(330);
    });

    test("returns undefined for empty, zero, or malformed durations", () => {
        expect(parseIsoDuration("")).toBeUndefined();
        expect(parseIsoDuration("P")).toBeUndefined();
        expect(parseIsoDuration("PT")).toBeUndefined();
        expect(parseIsoDuration("PT0S")).toBeUndefined();
        expect(parseIsoDuration("120")).toBeUndefined();
    });
});

describe("estimateGenericDash", () => {
    test("parses static VOD MPD with deduplicated video resolutions and separate audio track", async () => {
        const mpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD type="static" mediaPresentationDuration="PT2M">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="1" width="1280" height="720" bandwidth="2400000" frameRate="30000/1001" codecs="avc1.4d401f" />
      <Representation id="2" width="1920" height="1080" bandwidth="4000000" frameRate="30" codecs="vp09.00.40.08" />
      <Representation id="3" width="1920" height="1080" bandwidth="6400000" frameRate="60" codecs="av01.0.08M.08" />
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4">
      <Representation id="a1" bandwidth="128000" codecs="mp4a.40.2" />
      <Representation id="a2" bandwidth="160000" codecs="opus" />
    </AdaptationSet>
  </Period>
</MPD>`;

        const estimate = await estimateGenericDash("https://cdn.example.com/video/manifest.mpd", {
            title: "DASH Clip",
            sleep: instantSleep,
            fetch: async () => new Response(mpd, { status: 200 }),
        });

        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            title: "DASH Clip",
            durationSeconds: 120,
            audio: {
                formatId: 0,
                codec: "opus",
                bitrate: 160_000,
                bytesPerSecond: 20_000,
                sizeBytes: 2_400_000,
                itags: [],
            },
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizePerSecondBytes: 800_000,
                    sizeBytes: 96_000_000,
                    fps: 60,
                    codec: "av01",
                },
                {
                    kind: "vod",
                    resolution: 720,
                    sizePerSecondBytes: 300_000,
                    sizeBytes: 36_000_000,
                    fps: 30,
                    codec: "avc",
                },
            ],
        });
    });

    test("falls back to Period duration and handles dynamic live streams", async () => {
        const periodVodMpd = `<?xml version="1.0"?>
<MPD type="static">
  <Period duration="PT30S">
    <AdaptationSet mimeType="video/mp4">
      <Representation height="480" bandwidth="1600000" />
    </AdaptationSet>
  </Period>
</MPD>`;

        const vodEstimate = await estimateGenericDash("https://cdn.example.com/period.mpd", {
            sleep: instantSleep,
            fetch: async () => new Response(periodVodMpd, { status: 200 }),
        });

        expect(vodEstimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 30,
            formats: [
                {
                    kind: "vod",
                    resolution: 480,
                    sizePerSecondBytes: 200_000,
                    sizeBytes: 6_000_000,
                },
            ],
        });

        const liveMpd = `<?xml version="1.0"?>
<MPD type="dynamic">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation height="720" bandwidth="3200000" />
    </AdaptationSet>
  </Period>
</MPD>`;

        const liveEstimate = await estimateGenericDash("https://cdn.example.com/live.mpd", {
            sleep: instantSleep,
            fetch: async () => new Response(liveMpd, { status: 200 }),
        });

        expect(liveEstimate).toEqual({
            platform: "generic",
            contentType: "live",
            formats: [{ kind: "live", resolution: 720, sizePerSecondBytes: 400_000 }],
        });
    });

    test("throws classified MediaEstimateError on invalid manifests or HTTP errors", async () => {
        await expect(
            estimateGenericDash("https://cdn.example.com/bad.mpd", {
                sleep: instantSleep,
                fetch: async () => new Response("<html />", { status: 200 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });

        await expect(
            estimateGenericDash("https://cdn.example.com/empty.mpd", {
                sleep: instantSleep,
                fetch: async () => new Response("<MPD><Period></Period></MPD>", { status: 200 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });

        await expect(
            estimateGenericDash("https://cdn.example.com/missing.mpd", {
                sleep: instantSleep,
                fetch: async () => new Response("Not found", { status: 404 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "unavailable" });
    });

    test("sums per-period video and audio sizes separately across multi-period VOD manifests", async () => {
        const multiPeriodMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD type="static" mediaPresentationDuration="PT120S">
  <Period duration="PT60S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v1" width="1920" height="1080" bandwidth="8000000" codecs="avc1.640028" />
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4">
      <Representation id="a1" bandwidth="160000" codecs="mp4a.40.2" />
    </AdaptationSet>
  </Period>
  <Period duration="PT60S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v2" width="1920" height="1080" bandwidth="1000000" codecs="avc1.640028" />
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/mp4">
      <Representation id="a2" bandwidth="64000" codecs="mp4a.40.2" />
    </AdaptationSet>
  </Period>
</MPD>`;

        let seenCredentials: RequestCredentials | undefined;
        const estimate = await estimateGenericDash("https://cdn.example.com/multi.mpd", {
            sleep: instantSleep,
            fetch: async (_input, init) => {
                seenCredentials = init?.credentials;
                return new Response(multiPeriodMpd, { status: 200 });
            },
        });

        expect(seenCredentials).toBe("include");
        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 120,
            audio: {
                formatId: 0,
                codec: "aac",
                bitrate: 112_000,
                bytesPerSecond: 14_000,
                sizeBytes: 1_680_000,
                itags: [],
            },
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizePerSecondBytes: 562_500,
                    sizeBytes: 67_500_000,
                    codec: "avc",
                },
            ],
        });
    });

    test("resolves multi-period start offsets and enforces manifest size and timeout bounds", async () => {
        const startOffsetMpd = `<?xml version="1.0"?>
<MPD type="static" mediaPresentationDuration="PT90S">
  <Period start="PT0S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation height="1080" bandwidth="4000000" />
      <Representation height="720" bandwidth="2000000" />
    </AdaptationSet>
  </Period>
  <Period start="PT30S">
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation height="720" bandwidth="1000000" />
    </AdaptationSet>
  </Period>
</MPD>`;

        const estimate = await estimateGenericDash("https://cdn.example.com/offsets.mpd", {
            sleep: instantSleep,
            fetch: async () => new Response(startOffsetMpd, { status: 200 }),
        });

        expect(estimate).toEqual({
            platform: "generic",
            contentType: "vod",
            durationSeconds: 90,
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    // 30s @ 500 KB/s (15 MB) + 60s @ 125 KB/s (7.5 MB fallback to 720p) = 22.5 MB
                    sizeBytes: 22_500_000,
                    sizePerSecondBytes: 250_000,
                },
                {
                    kind: "vod",
                    resolution: 720,
                    // 30s @ 250 KB/s (7.5 MB) + 60s @ 125 KB/s (7.5 MB) = 15 MB
                    sizeBytes: 15_000_000,
                    sizePerSecondBytes: 15_000_000 / 90,
                },
            ],
        });

        await expect(
            estimateGenericDash("https://cdn.example.com/huge.mpd", {
                sleep: instantSleep,
                maxManifestBytes: 64,
                fetch: async () => new Response(startOffsetMpd, { status: 200 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "no_formats" });

        await expect(
            estimateGenericDash("https://cdn.example.com/slow.mpd", {
                sleep: instantSleep,
                timeoutMs: 30,
                fetch: async (_input, init) =>
                    new Promise<Response>((_resolve, reject) => {
                        init?.signal?.addEventListener("abort", () => {
                            reject(new DOMException("Aborted", "AbortError"));
                        });
                    }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "network_error" });
    });
});
