import { describe, expect, test } from "bun:test";

import { estimateGenericDash } from "@lib/dash";

const instantSleep = async () => {};

describe("estimateGenericDash", () => {
    test("parses static VOD MPD with deduplicated video resolutions, codecs, and separate audio track", async () => {
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

        let seenCredentials: RequestCredentials | undefined;
        const estimate = await estimateGenericDash("https://cdn.example.com/video/manifest.mpd", {
            title: "DASH Clip",
            sleep: instantSleep,
            fetch: async (_input, init) => {
                seenCredentials = init?.credentials;
                return new Response(mpd, { status: 200 });
            },
        });

        expect(seenCredentials).toBe("include");
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
  <Period duration="PT1H2M3.5S">
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
            durationSeconds: 3723.5,
            formats: [
                {
                    kind: "vod",
                    resolution: 480,
                    sizePerSecondBytes: 200_000,
                    sizeBytes: 744_700_000,
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
            estimateGenericDash("https://cdn.example.com/missing.mpd", {
                sleep: instantSleep,
                fetch: async () => new Response("Not found", { status: 404 }),
            }),
        ).rejects.toMatchObject({ name: "MediaEstimateError", code: "unavailable" });
    });
});
