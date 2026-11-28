import { describe, expect, test } from "bun:test";

import { estimateGenericDash } from "@lib/dash";

const instantSleep = async () => {};

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

        // Fractional / hours ISO 8601 duration computes VOD size accurately; malformed duration falls back to live.
        const fractionalVodMpd = `<?xml version="1.0"?>
<MPD type="static" mediaPresentationDuration="PT1H2M3.5S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation height="720" bandwidth="800000" />
    </AdaptationSet>
  </Period>
</MPD>`;
        const fractionalVod = await estimateGenericDash("https://cdn.example.com/long.mpd", {
            sleep: instantSleep,
            fetch: async () => new Response(fractionalVodMpd, { status: 200 }),
        });
        expect(fractionalVod).toMatchObject({
            contentType: "vod",
            durationSeconds: 3723.5,
            formats: [{ kind: "vod", resolution: 720, sizeBytes: 372_350_000 }],
        });

        const malformedDurationMpd = `<?xml version="1.0"?>
<MPD type="static" mediaPresentationDuration="PT0S">
  <Period>
    <AdaptationSet mimeType="video/mp4">
      <Representation height="720" bandwidth="800000" />
    </AdaptationSet>
  </Period>
</MPD>`;
        const malformedFallback = await estimateGenericDash("https://cdn.example.com/zero.mpd", {
            sleep: instantSleep,
            fetch: async () => new Response(malformedDurationMpd, { status: 200 }),
        });
        expect(malformedFallback).toMatchObject({
            contentType: "live",
            formats: [{ kind: "live", resolution: 720, sizePerSecondBytes: 100_000 }],
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

    test("uses the first Period with video formats and enforces credentials, size, and timeout bounds", async () => {
        const multiPeriodMpd = `<?xml version="1.0" encoding="UTF-8"?>
<MPD type="static" mediaPresentationDuration="PT120S">
  <Period duration="PT10S">
    <AdaptationSet contentType="audio" mimeType="audio/mp4">
      <Representation id="a0" bandwidth="128000" codecs="mp4a.40.2" />
    </AdaptationSet>
  </Period>
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
                bitrate: 160_000,
                bytesPerSecond: 20_000,
                sizeBytes: 2_400_000,
                itags: [],
            },
            formats: [
                {
                    kind: "vod",
                    resolution: 1080,
                    sizePerSecondBytes: 1_000_000,
                    sizeBytes: 120_000_000,
                    codec: "avc",
                },
            ],
        });

        await expect(
            estimateGenericDash("https://cdn.example.com/huge.mpd", {
                sleep: instantSleep,
                maxManifestBytes: 64,
                fetch: async () => new Response(multiPeriodMpd, { status: 200 }),
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
