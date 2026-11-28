import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import type { BrowserContext } from "playwright-core";

const ROOT = resolve(import.meta.dir, "..", "..");
const ASSETS_DIR = join(ROOT, "src", "tests", "assets");

const TRANSPARENT_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
);

const FIXTURE_TARGETS = [
    "fixture:usage-site",
    "fixture:youtube-vod",
    "fixture:youtube-shorts",
    "fixture:youtube-live",
    "fixture:youtube-home",
    "fixture:twitch-live",
    "fixture:twitch-live-ads",
    "fixture:twitch-vod",
    "fixture:twitch-directory",
    "fixture:kick-live",
    "fixture:kick-vod",
    "fixture:kick-vod-slug",
    "fixture:kick-browse",
    "fixture:google-drive",
    "fixture:embed-youtube",
    "fixture:generic-hls",
    "fixture:generic-dash",
    "fixture:generic-direct",
    "fixture:multi-video",
] as const;

export type FixtureTarget = (typeof FIXTURE_TARGETS)[number];

export function isFixtureTarget(raw: string): raw is FixtureTarget {
    return (FIXTURE_TARGETS as readonly string[]).includes(raw);
}

export function resolveFixtureTarget(
    raw: FixtureTarget,
    serverPort: number,
): { url: string; viewport: { width: number; height: number } } {
    const viewport = { width: 1280, height: 800 };
    switch (raw) {
        case "fixture:usage-site":
            return {
                url: `http://127.0.0.1:${serverPort}/__fixture__/usage-site`,
                viewport,
            };
        case "fixture:youtube-vod":
            return { url: "https://www.youtube.com/watch?v=I82j7AzMU80", viewport };
        case "fixture:youtube-shorts":
            return { url: "https://www.youtube.com/shorts/I82j7AzMU80", viewport };
        case "fixture:youtube-live":
            return { url: "https://www.youtube.com/live/feSFplc7tMY", viewport };
        case "fixture:youtube-home":
            return { url: "https://www.youtube.com/", viewport };
        case "fixture:twitch-live":
            return { url: "https://www.twitch.tv/hivise", viewport };
        case "fixture:twitch-live-ads":
            return { url: "https://www.twitch.tv/hivise_ads", viewport };
        case "fixture:twitch-vod":
            return { url: "https://www.twitch.tv/videos/2748008198", viewport };
        case "fixture:twitch-directory":
            return { url: "https://www.twitch.tv/directory", viewport };
        case "fixture:kick-live":
            return { url: "https://kick.com/xqc", viewport };
        case "fixture:kick-vod":
            return {
                url: "https://kick.com/xqc/videos/11111111-2222-3333-4444-555555555555",
                viewport,
            };
        case "fixture:kick-vod-slug":
            return { url: "https://kick.com/xqc/videos/c7093a5c-demo-vod", viewport };
        case "fixture:kick-browse":
            return { url: "https://kick.com/browse", viewport };
        case "fixture:google-drive":
            return { url: "https://drive.google.com/drive/my-drive", viewport };
        case "fixture:embed-youtube":
            return { url: "https://video-blog.mock.invalid/article-embed", viewport };
        case "fixture:generic-hls":
            return { url: "https://video-blog.mock.invalid/hls-player", viewport };
        case "fixture:generic-dash":
            return { url: "https://video-blog.mock.invalid/dash-player", viewport };
        case "fixture:generic-direct":
            return { url: "https://video-blog.mock.invalid/direct-video", viewport };
        case "fixture:multi-video":
            return { url: "https://video-blog.mock.invalid/multi-video", viewport };
    }
}

function parseSizeParam(url: URL, fallback: number): number {
    const raw = Number(url.searchParams.get("size") ?? fallback);
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.min(Math.floor(raw), 5_000_000);
}

function usageSiteHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>TubeSize Usage Tracking Fixture</title>
</head>
<body>
  <h1>TubeSize Usage Tracking Fixture</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
    <button type="button" id="btn-fixed">Fetch fixed 200 KB</button>
    <button type="button" id="btn-stream">Fetch chunked 150 KB</button>
    <button type="button" id="btn-xhr">XHR chunked 100 KB</button>
    <button type="button" id="btn-worker">Worker chunked 120 KB</button>
    <button type="button" id="btn-head">Send HEAD 200 KB</button>
    <button type="button" id="btn-all">Run all usage paths</button>
  </div>
  <output id="usage-status">Idle</output>
  <script>
    const statusEl = document.getElementById("usage-status");
    async function runFixed() {
      const res = await fetch("/__fixture__/fixed?size=200000");
      await res.arrayBuffer();
      statusEl.textContent = "Fixed 200000 done";
    }
    async function runStream() {
      const res = await fetch("/__fixture__/stream?size=150000");
      await res.arrayBuffer();
      statusEl.textContent = "Chunked 150000 done";
    }
    async function runXhr() {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("GET", "/__fixture__/xhr-stream?size=100000");
        xhr.addEventListener("load", () => resolve());
        xhr.addEventListener("error", () => reject(new Error("XHR failed")));
        xhr.send();
      });
      statusEl.textContent = "XHR 100000 done";
    }
    async function runWorker() {
      const source = \`
        self.addEventListener("message", async (ev) => {
          const res = await fetch(ev.data);
          await res.arrayBuffer();
          self.postMessage("done");
        });
      \`;
      const workerUrl = URL.createObjectURL(new Blob([source], { type: "application/javascript" }));
      const worker = new Worker(workerUrl);
      window.__tsWorkers = window.__tsWorkers || [];
      window.__tsWorkers.push(worker);
      await new Promise((resolve) => {
        worker.addEventListener("message", (ev) => {
          if (ev.data === "done") resolve();
        });
        worker.postMessage(location.origin + "/__fixture__/worker-stream?size=120000");
      });
      URL.revokeObjectURL(workerUrl);
      statusEl.textContent = "Worker 120000 done";
    }
    async function runHead() {
      await fetch("/__fixture__/fixed?size=200000", { method: "HEAD" });
      statusEl.textContent = "HEAD 200000 done";
    }
    document.getElementById("btn-fixed").addEventListener("click", () => void runFixed());
    document.getElementById("btn-stream").addEventListener("click", () => void runStream());
    document.getElementById("btn-xhr").addEventListener("click", () => void runXhr());
    document.getElementById("btn-worker").addEventListener("click", () => void runWorker());
    document.getElementById("btn-head").addEventListener("click", () => void runHead());
    document.getElementById("btn-all").addEventListener("click", async () => {
      statusEl.textContent = "Running...";
      await runFixed();
      await runStream();
      await runXhr();
      await runWorker();
      await runHead();
      statusEl.textContent = "Done: 570000 bytes expected";
    });
  </script>
</body>
</html>`;
}

export function handleUsageFixtureRequest(req: Request): Response | null {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/__fixture__/")) return null;

    if (url.pathname === "/__fixture__/usage-site") {
        const htmlBytes = new TextEncoder().encode(usageSiteHtml());
        const htmlStream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(htmlBytes);
                controller.close();
            },
        });
        return new Response(htmlStream, {
            headers: {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
            },
        });
    }

    if (url.pathname === "/__fixture__/fixed") {
        const size = parseSizeParam(url, 200_000);
        if (req.method === "HEAD") {
            return new Response(null, {
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "content-length": String(size),
                    "cache-control": "no-store",
                },
            });
        }
        return new Response(new Uint8Array(size), {
            headers: {
                "content-type": "application/octet-stream",
                "content-length": String(size),
                "cache-control": "no-store",
            },
        });
    }

    if (
        url.pathname === "/__fixture__/stream" ||
        url.pathname === "/__fixture__/xhr-stream" ||
        url.pathname === "/__fixture__/worker-stream"
    ) {
        const fallback =
            url.pathname === "/__fixture__/stream"
                ? 150_000
                : url.pathname === "/__fixture__/xhr-stream"
                  ? 100_000
                  : 120_000;
        const size = parseSizeParam(url, fallback);
        const firstHalf = Math.floor(size / 2);
        const secondHalf = size - firstHalf;
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array(firstHalf));
                setTimeout(() => {
                    controller.enqueue(new Uint8Array(secondHalf));
                    controller.close();
                }, 25);
            },
        });
        return new Response(stream, {
            headers: {
                "content-type": "application/octet-stream",
                "cache-control": "no-store",
            },
        });
    }

    return new Response("Not found", { status: 404 });
}

function readAssetText(name: string): string {
    return readFileSync(join(ASSETS_DIR, name), "utf8").trim();
}

function extractTwitchClientId(): string {
    const html = readAssetText("twitch.html");
    const match = html.match(/clientId\s*=\s*"(.*?)"/);
    return match?.[1] ?? "kimne78kx3ncx6brgo4mv6wki5et0ko";
}

function videoControlMarkup(initialWidth: number, initialHeight: number): string {
    return `
  <video id="ts-fixture-video" muted autoplay playsinline style="width:320px;height:180px;background:#111"></video>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
    <button type="button" onclick="window.__tsSetVideoSize(640,360)">Set video 360p</button>
    <button type="button" onclick="window.__tsSetVideoSize(854,480)">Set video 480p</button>
    <button type="button" onclick="window.__tsSetVideoSize(1280,720)">Set video 720p</button>
    <button type="button" onclick="window.__tsSetVideoSize(1920,1080)">Set video 1080p</button>
    <button type="button" onclick="window.__tsSetVideoSize(3840,2160)">Set video 2160p</button>
    <button type="button" onclick="void window.__tsSendMediaTraffic()">Trigger media traffic 150 KB</button>
  </div>
  <output id="media-status">Ready</output>
  <script>
    (() => {
      const canvas = document.createElement("canvas");
      canvas.width = ${initialWidth};
      canvas.height = ${initialHeight};
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const video = document.getElementById("ts-fixture-video");
      video.srcObject = canvas.captureStream(5);
      void video.play().catch(() => {});
      window.__tsSetVideoSize = (w, h) => {
        canvas.width = w;
        canvas.height = h;
        const c = canvas.getContext("2d");
        if (c) {
          c.fillStyle = "#09090b";
          c.fillRect(0, 0, w, h);
        }
      };
      window.__tsSendMediaTraffic = async () => {
        await fetch("/__ts_media_fixed").then((r) => r.arrayBuffer());
        await fetch("/__ts_media_stream").then((r) => r.arrayBuffer());
        const outEl = document.getElementById("media-status");
        if (outEl) outEl.textContent = "Sent 150000 bytes";
      };
    })();
  </script>`;
}

function buildYoutubeHtml(opts: {
    title: string;
    playerJson?: string;
    initialWidth?: number;
    initialHeight?: number;
    isWatchPage: boolean;
}): string {
    const playerScript = opts.playerJson
        ? `<script>var ytInitialPlayerResponse = ${opts.playerJson};</script>`
        : "";
    const watchControls = opts.isWatchPage
        ? `
  ${videoControlMarkup(opts.initialWidth ?? 1920, opts.initialHeight ?? 1080)}
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0">
    <button type="button" onclick="window.__tsOpenQualityMenu()">Open Quality Menu</button>
    <button type="button" onclick="window.__tsCloseQualityMenu()">Close Quality Menu</button>
    <button type="button" onclick="window.__tsSpaNavigate('/live/feSFplc7tMY')">SPA navigate to Live</button>
    <button type="button" onclick="window.__tsSpaNavigate('/')">SPA navigate to Home</button>
  </div>
  <div class="ytp-settings-menu"></div>
  <script>
    window.__tsOpenQualityMenu = () => {
      const menu = document.querySelector(".ytp-settings-menu");
      if (!menu) return;
      menu.innerHTML = \`
        <div class="ytp-panel ytp-quality-menu">
          <div class="ytp-panel-menu">
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>2160p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>1440p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>1080p <span class="ytp-premium-label">Premium</span></span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>1080p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>720p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>480p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>360p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>240p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>144p</span></div></div></div>
            <div class="ytp-menuitem"><div class="ytp-menuitem-label"><div><span>Auto</span></div></div></div>
          </div>
        </div>
      \`;
    };
    window.__tsCloseQualityMenu = () => {
      const menu = document.querySelector(".ytp-settings-menu");
      if (menu) menu.innerHTML = "";
    };
    window.__tsSpaNavigate = (path) => {
      history.pushState({}, "", path);
      window.dispatchEvent(new Event("yt-navigate-finish"));
    };
  </script>`
        : "<p>YouTube Home Fixture (no video running)</p>";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>${opts.title}</title>
  ${playerScript}
</head>
<body>
  <h1>${opts.title}</h1>
  ${watchControls}
</body>
</html>`;
}

function buildMasterM3u8(hostOrigin: string): string {
    return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"
${hostOrigin}/playlist/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2"
${hostOrigin}/playlist/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=400000,RESOLUTION=854x480,CODECS="avc1.4D401F,mp4a.40.2"
${hostOrigin}/playlist/480p.m3u8
`;
}

function buildMediaM3u8(opts: {
    segOrigin: string;
    quality: "1080p" | "720p" | "480p";
    hasAds: boolean;
}): string {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3", "#EXT-X-TARGETDURATION:2"];
    for (let i = 0; i < 6; i++) {
        const title = opts.hasAds && i >= 2 ? "Amazon" : "live";
        lines.push(`#EXTINF:2.0,${title}`);
        lines.push(`${opts.segOrigin}/seg/${opts.quality}/${i}.ts`);
    }
    return `${lines.join("\n")}\n`;
}

const SEGMENT_SIZE_BY_QUALITY: Record<string, number> = {
    "1080p": 1_500_000,
    "720p": 800_000,
    "480p": 120_000,
};

function buildTwitchHtml(opts: {
    clientId: string;
    title: string;
    channelName: string;
    contentType: "live" | "vod" | "directory";
}): string {
    const ldJson =
        opts.contentType === "directory"
            ? JSON.stringify({ "@graph": [] })
            : JSON.stringify({
                  "@graph": [
                      {
                          "@type": "Person",
                          alternateName: opts.channelName,
                          url: `https://www.twitch.tv/${opts.channelName}`,
                      },
                      {
                          "@type": "VideoObject",
                          name: opts.title,
                          description:
                              opts.contentType === "live"
                                  ? opts.title
                                  : `${opts.channelName} went live on Twitch. VOD replay.`,
                          thumbnailUrl: [],
                      },
                  ],
              });
    const body =
        opts.contentType === "directory"
            ? "<p>Twitch Directory Fixture (no video running)</p>"
            : videoControlMarkup(854, 480);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>${opts.title}</title>
  <script>window.__TWITCH_CLIENT_ID__ = "${opts.clientId}"; var clientId = "${opts.clientId}";</script>
  <script type="application/ld+json">${ldJson}</script>
</head>
<body>
  <h1>${opts.title}</h1>
  ${body}
</body>
</html>`;
}

function buildKickHtml(opts: { title: string; streamId?: string; isVideoPage: boolean }): string {
    const streamPayload = opts.streamId
        ? `<script>window.__KICK_STREAM__ = {"vod_id":"${opts.streamId}"};</script>`
        : "";
    const body = opts.isVideoPage
        ? videoControlMarkup(854, 480)
        : "<p>Kick Browse Fixture (no video running)</p>";

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <meta property="og:title" content="${opts.title}" />
  <title>${opts.title}</title>
  ${streamPayload}
</head>
<body>
  <h1>${opts.title}</h1>
  ${body}
</body>
</html>`;
}

function buildYoutubeEmbedHtml(mediaId: string): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>YouTube Embed ${mediaId}</title>
</head>
<body>
  <video id="yt-embed-video" muted autoplay playsinline style="width:320px;height:180px;background:#111"></video>
  <script>
    (() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      const video = document.getElementById("yt-embed-video");
      video.srcObject = canvas.captureStream(5);
      const notifyReady = () => window.parent.postMessage("ts-embed-ready", "*");
      video.addEventListener("playing", notifyReady, { once: true });
      void video.play().catch(() => {});
      window.addEventListener("message", async (ev) => {
        if (ev.data !== "ts-trigger-embed-traffic") return;
        await fetch("https://www.youtube.com/__ts_media_fixed").then((r) => r.arrayBuffer());
        window.parent.postMessage("ts-embed-traffic-done", "*");
      });
    })();
  </script>
</body>
</html>`;
}

function buildEmbedYoutubePageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>Embedded Video Article</title>
</head>
<body>
  <h1>Embedded YouTube Article</h1>
  <iframe
    id="yt-embed-frame"
    src="https://www.youtube.com/embed/I82j7AzMU80"
    title="Embedded Claude Code Walkthrough"
    style="width:480px;height:270px;border:0"
  ></iframe>
  <div style="margin:8px 0">
    <button type="button" id="btn-embed-traffic">Trigger embed traffic 100 KB</button>
  </div>
  <output id="embed-status">Loading embed...</output>
  <script>
    const statusEl = document.getElementById("embed-status");
    const frame = document.getElementById("yt-embed-frame");
    window.addEventListener("message", (ev) => {
      if (ev.data === "ts-embed-ready" && statusEl) {
        statusEl.textContent = "Embed ready";
      }
      if (ev.data === "ts-embed-traffic-done" && statusEl) {
        statusEl.textContent = "Embed traffic 100000 done";
      }
    });
    document.getElementById("btn-embed-traffic").addEventListener("click", () => {
      frame.contentWindow?.postMessage("ts-trigger-embed-traffic", "*");
    });
  </script>
</body>
</html>`;
}

function buildGenericHlsMasterM3u8(): string {
    return `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-STREAM-INF:BANDWIDTH=4000000,RESOLUTION=1920x1080,CODECS="avc1.64002A,mp4a.40.2"
https://generic-media.mock.invalid/hls/1080p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=2400000,RESOLUTION=1280x720,CODECS="avc1.64001F,mp4a.40.2"
https://generic-media.mock.invalid/hls/720p.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=854x480,CODECS="avc1.4D401F,mp4a.40.2"
https://generic-media.mock.invalid/hls/480p.m3u8
`;
}

function buildGenericHlsVodVariantM3u8(quality: string): string {
    const lines = [
        "#EXTM3U",
        "#EXT-X-VERSION:3",
        "#EXT-X-PLAYLIST-TYPE:VOD",
        "#EXT-X-TARGETDURATION:60",
    ];
    for (let i = 0; i < 10; i++) {
        lines.push("#EXTINF:60.0,");
        lines.push(`https://generic-media.mock.invalid/hls/seg/${quality}/${i}.ts`);
    }
    lines.push("#EXT-X-ENDLIST");
    return `${lines.join("\n")}\n`;
}

function buildGenericDashMpd(): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static" mediaPresentationDuration="PT10M">
  <Period>
    <AdaptationSet contentType="video" mimeType="video/mp4">
      <Representation id="v1080" width="1920" height="1080" bandwidth="4000000" codecs="avc1.640028" frameRate="60" />
      <Representation id="v720" width="1280" height="720" bandwidth="2000000" codecs="vp09.00.31.08" frameRate="30" />
    </AdaptationSet>
    <AdaptationSet contentType="audio" mimeType="audio/webm">
      <Representation id="a1" bandwidth="160000" codecs="opus" />
    </AdaptationSet>
  </Period>
</MPD>`;
}

function buildGenericHlsPageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>Generic HLS Stream Demo</title>
</head>
<body>
  <h1>Generic HLS Stream Demo</h1>
  <video id="hls-video" muted playsinline title="Generic HLS Stream Demo" style="width:320px;height:180px;background:#111"></video>
  <output id="hls-status">Loading HLS...</output>
  <script>
    (async () => {
      const video = document.getElementById("hls-video");
      const ms = new MediaSource();
      video.src = URL.createObjectURL(ms);
      await fetch("https://generic-media.mock.invalid/hls/master.m3u8").then((r) => r.text());
      await fetch("https://generic-media.mock.invalid/hls/1080p.m3u8").then((r) => r.text());
      const out = document.getElementById("hls-status");
      if (out) out.textContent = "HLS manifests loaded";
    })();
  </script>
</body>
</html>`;
}

function buildGenericDashPageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>Generic DASH Shadow Player</title>
</head>
<body>
  <h1>Generic DASH Shadow Player</h1>
  <div id="shadow-player-host"></div>
  <output id="dash-status">Loading DASH...</output>
  <script>
    (async () => {
      const host = document.getElementById("shadow-player-host");
      const root = host.attachShadow({ mode: "open" });
      const video = document.createElement("video");
      video.id = "dash-video";
      video.muted = true;
      video.playsInline = true;
      video.title = "Generic DASH Shadow Player";
      video.style.cssText = "width:320px;height:180px;background:#111";
      const ms = new MediaSource();
      video.src = URL.createObjectURL(ms);
      root.appendChild(video);
      await fetch("https://generic-media.mock.invalid/dash/manifest.mpd").then((r) => r.text());
      const out = document.getElementById("dash-status");
      if (out) out.textContent = "DASH manifest loaded";
    })();
  </script>
</body>
</html>`;
}

function buildGenericDirectPageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>Direct MP4 Page</title>
</head>
<body>
  <h1>Direct MP4 Page</h1>
  <video
    id="direct-video"
    preload="none"
    title="Direct MP4 Demo"
    src="https://generic-media.mock.invalid/direct/clip.mp4"
    style="width:320px;height:180px;background:#111"
  ></video>
  <output id="direct-status">Direct video ready</output>
</body>
</html>`;
}

function buildMultiVideoPageHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>Multi Video Gallery</title>
</head>
<body>
  <h1>Multi Video Gallery</h1>
  <video
    id="clip-1"
    preload="none"
    muted
    playsinline
    title="First Clip"
    src="https://generic-media.mock.invalid/direct/clip-1.mp4"
    style="width:240px;height:135px;background:#111"
  ></video>
  <video
    id="clip-2"
    preload="none"
    muted
    playsinline
    title="Second Clip"
    src="https://generic-media.mock.invalid/direct/clip-2.mp4"
    style="width:240px;height:135px;background:#111"
  ></video>
  <div style="display:flex;gap:8px;margin:8px 0">
    <button type="button" id="btn-play-second">Play Second Clip</button>
    <button type="button" id="btn-pause-all">Pause All Clips</button>
  </div>
  <output id="multi-status">All clips paused</output>
  <script>
    const statusEl = document.getElementById("multi-status");
    const clip1 = document.getElementById("clip-1");
    const clip2 = document.getElementById("clip-2");
    document.getElementById("btn-play-second").addEventListener("click", async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.fillStyle = "#18181b";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      clip2.srcObject = canvas.captureStream(5);
      await clip2.play();
      while (clip2.readyState <= 2) {
        await new Promise((r) => setTimeout(r, 25));
      }
      if (statusEl) statusEl.textContent = "Second Clip playing";
    });
    document.getElementById("btn-pause-all").addEventListener("click", () => {
      clip1.pause();
      clip2.pause();
      clip1.srcObject = null;
      clip2.srcObject = null;
      if (statusEl) statusEl.textContent = "All clips paused";
    });
  </script>
</body>
</html>`;
}

const DIRECT_VIDEO_SIZES: Record<string, number> = {
    "/direct/clip.mp4": 45_000_000,
    "/direct/clip-1.mp4": 25_000_000,
    "/direct/clip-2.mp4": 60_000_000,
};

const PLATFORM_ROUTE_PATTERNS = [
    "**/favicon.ico",
    "https://i.ytimg.com/**",
    "https://www.youtube.com/**",
    "https://www.twitch.tv/**",
    "https://gql.twitch.tv/**",
    "https://usher.ttvnw.net/**",
    "https://video-weaver.mock.ttvnw.net/**",
    "https://kick.com/**",
    "https://web.kick.com/**",
    "https://kick-hls.mock.invalid/**",
    "https://drive.google.com/**",
    "https://video-blog.mock.invalid/**",
    "https://generic-media.mock.invalid/**",
] as const;

export async function installPlatformRoutes(context: BrowserContext): Promise<void> {
    const ytVodJson = readAssetText("ytInitialPlayerResponse.json");
    const ytLiveJson = readAssetText("ytInitialPlayerResponseLive.json");
    const twitchClientId = extractTwitchClientId();

    await context.route("**/favicon.ico", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: TRANSPARENT_PNG,
        });
    });

    await context.route("https://i.ytimg.com/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "image/png",
            body: TRANSPARENT_PNG,
        });
    });

    await context.route("https://www.youtube.com/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/__ts_media_fixed") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "content-length": "100000",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(100_000),
            });
        }
        // route.fulfill always gives the browser a Content-Length, so this is not a chunked
        // response. Genuine chunked accounting is covered by the local /__fixture__/stream handler
        // (fixture:usage-site); platform media routes only add media bytes to the site total.
        if (url.pathname === "/__ts_media_stream") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(50_000),
            });
        }

        const mediaId =
            url.pathname === "/watch"
                ? url.searchParams.get("v")
                : url.pathname.startsWith("/shorts/") ||
                    url.pathname.startsWith("/live/") ||
                    url.pathname.startsWith("/embed/")
                  ? url.pathname.split("/")[2]
                  : null;

        if (!mediaId) {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildYoutubeHtml({ title: "YouTube Home", isWatchPage: false }),
            });
        }

        if (url.pathname.startsWith("/embed/")) {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildYoutubeEmbedHtml(mediaId),
            });
        }

        const isLive = mediaId === "feSFplc7tMY" || url.pathname.startsWith("/live/");
        const playerJson = isLive ? ytLiveJson : ytVodJson;
        const initialWidth = isLive ? 640 : 1920;
        const initialHeight = isLive ? 360 : 1080;

        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "cache-control": "no-store" },
            body: buildYoutubeHtml({
                title: isLive ? "YouTube Live Fixture" : "YouTube VOD Fixture",
                playerJson,
                initialWidth,
                initialHeight,
                isWatchPage: true,
            }),
        });
    });

    await context.route("https://www.twitch.tv/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/__ts_media_fixed") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "content-length": "100000",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(100_000),
            });
        }
        if (url.pathname === "/__ts_media_stream") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(50_000),
            });
        }

        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "directory") {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildTwitchHtml({
                    clientId: twitchClientId,
                    title: "Twitch Directory",
                    channelName: "directory",
                    contentType: "directory",
                }),
            });
        }
        if (parts[0] === "videos") {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildTwitchHtml({
                    clientId: twitchClientId,
                    title: "Ranked grind to Radiant — VOD",
                    channelName: "hivise",
                    contentType: "vod",
                }),
            });
        }
        const channelName = parts[0] ?? "hivise";
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "cache-control": "no-store" },
            body: buildTwitchHtml({
                clientId: twitchClientId,
                title: `${channelName} Live Stream`,
                channelName,
                contentType: "live",
            }),
        });
    });

    await context.route("https://gql.twitch.tv/**", async (route) => {
        let body: {
            variables?: { isLive?: boolean; isVod?: boolean; login?: string };
        } = {};
        try {
            body = JSON.parse(route.request().postData() ?? "{}") as typeof body;
        } catch {
            // Treat malformed fixture request bodies as empty.
        }

        if (body.variables?.isVod) {
            return await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    data: {
                        videoPlaybackAccessToken: {
                            value: '{"vod":true}',
                            signature: "vod-sig",
                        },
                        video: { lengthSeconds: 3600 },
                    },
                }),
            });
        }

        const channel = body.variables?.login ?? "hivise";
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                data: {
                    streamPlaybackAccessToken: {
                        value: JSON.stringify({ channel }),
                        signature: "live-sig",
                    },
                },
            }),
        });
    });

    await context.route("https://usher.ttvnw.net/**", async (route) => {
        const url = new URL(route.request().url());
        const hasAds = url.pathname.includes("hivise_ads");
        const weaverOrigin = hasAds
            ? "https://video-weaver.mock.ttvnw.net/ads"
            : "https://video-weaver.mock.ttvnw.net/clean";
        await route.fulfill({
            status: 200,
            contentType: "application/vnd.apple.mpegurl",
            headers: { "cache-control": "no-store" },
            body: buildMasterM3u8(weaverOrigin),
        });
    });

    await context.route("https://video-weaver.mock.ttvnw.net/**", async (route) => {
        const url = new URL(route.request().url());
        const hasAds = url.pathname.startsWith("/ads/");
        if (url.pathname.endsWith(".m3u8")) {
            const quality = url.pathname.includes("1080p")
                ? "1080p"
                : url.pathname.includes("720p")
                  ? "720p"
                  : "480p";
            return await route.fulfill({
                status: 200,
                contentType: "application/vnd.apple.mpegurl",
                headers: { "cache-control": "no-store" },
                body: buildMediaM3u8({
                    segOrigin: "https://video-weaver.mock.ttvnw.net",
                    quality,
                    hasAds,
                }),
            });
        }

        const segQuality = url.pathname.split("/")[2] ?? "480p";
        const totalSize = SEGMENT_SIZE_BY_QUALITY[segQuality] ?? 120_000;
        await route.fulfill({
            status: 206,
            headers: {
                "content-type": "video/mp2t",
                "content-range": `bytes 0-0/${totalSize}`,
                "cache-control": "no-store",
            },
            body: Buffer.alloc(1),
        });
    });

    await context.route("https://kick.com/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/__ts_media_fixed") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "content-length": "100000",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(100_000),
            });
        }
        if (url.pathname === "/__ts_media_stream") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(50_000),
            });
        }
        if (url.pathname === "/api/v1/video/11111111-2222-3333-4444-555555555555") {
            return await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({
                    source: "https://kick-hls.mock.invalid/vod/master.m3u8",
                    livestream: { duration: 3_600_000 },
                }),
            });
        }
        if (url.pathname === "/api/v2/channels/xqc/videos") {
            return await route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify([
                    {
                        slug: "c7093a5c-demo-vod",
                        source: "https://kick-hls.mock.invalid/vod/master.m3u8",
                        duration: 1_800_000,
                    },
                ]),
            });
        }

        const parts = url.pathname.split("/").filter(Boolean);
        if (parts[0] === "browse") {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildKickHtml({ title: "Kick Browse", isVideoPage: false }),
            });
        }
        if (parts.length === 3 && parts[1] === "videos") {
            return await route.fulfill({
                status: 200,
                contentType: "text/html; charset=utf-8",
                headers: { "cache-control": "no-store" },
                body: buildKickHtml({ title: "xQc Kick VOD", isVideoPage: true }),
            });
        }

        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "cache-control": "no-store" },
            body: buildKickHtml({
                title: "xQc Live Stream",
                streamId: "kick-stream-001",
                isVideoPage: true,
            }),
        });
    });

    await context.route("https://web.kick.com/**", async (route) => {
        await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({
                playback_url: {
                    live: "https://kick-hls.mock.invalid/live/master.m3u8",
                },
            }),
        });
    });

    await context.route("https://kick-hls.mock.invalid/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/master.m3u8")) {
            return await route.fulfill({
                status: 200,
                contentType: "application/vnd.apple.mpegurl",
                headers: { "cache-control": "no-store" },
                body: buildMasterM3u8("https://kick-hls.mock.invalid"),
            });
        }
        if (url.pathname.endsWith(".m3u8")) {
            const quality = url.pathname.includes("1080p")
                ? "1080p"
                : url.pathname.includes("720p")
                  ? "720p"
                  : "480p";
            return await route.fulfill({
                status: 200,
                contentType: "application/vnd.apple.mpegurl",
                headers: { "cache-control": "no-store" },
                body: buildMediaM3u8({
                    segOrigin: "https://kick-hls.mock.invalid",
                    quality,
                    hasAds: false,
                }),
            });
        }
        const segQuality = url.pathname.split("/")[2] ?? "480p";
        const totalSize = SEGMENT_SIZE_BY_QUALITY[segQuality] ?? 120_000;
        await route.fulfill({
            status: 206,
            headers: {
                "content-type": "video/mp2t",
                "content-range": `bytes 0-0/${totalSize}`,
                "cache-control": "no-store",
            },
            body: Buffer.alloc(1),
        });
    });

    await context.route("https://drive.google.com/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === "/__ts_drive_fixed") {
            return await route.fulfill({
                status: 200,
                headers: {
                    "content-type": "application/octet-stream",
                    "content-length": "250000",
                    "cache-control": "no-store",
                },
                body: Buffer.alloc(250_000),
            });
        }
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "cache-control": "no-store" },
            body: `<!doctype html>
<html lang="en">
<head><meta charset="utf-8" /><link rel="icon" href="data:," /><title>Google Drive Fixture</title></head>
<body>
  <h1>Google Drive Fixture</h1>
  <button type="button" id="btn-drive">Trigger Drive traffic 250 KB</button>
  <output id="drive-status">Idle</output>
  <script>
    document.getElementById("btn-drive").addEventListener("click", async () => {
      await fetch("https://drive.google.com/__ts_drive_fixed").then((r) => r.arrayBuffer());
      document.getElementById("drive-status").textContent = "Drive 250000 done";
    });
  </script>
</body>
</html>`,
        });
    });

    await context.route("https://video-blog.mock.invalid/**", async (route) => {
        const url = new URL(route.request().url());
        let body: string;
        switch (url.pathname) {
            case "/article-embed":
                body = buildEmbedYoutubePageHtml();
                break;
            case "/hls-player":
                body = buildGenericHlsPageHtml();
                break;
            case "/dash-player":
                body = buildGenericDashPageHtml();
                break;
            case "/direct-video":
                body = buildGenericDirectPageHtml();
                break;
            case "/multi-video":
                body = buildMultiVideoPageHtml();
                break;
            default:
                return await route.fulfill({ status: 404, body: "Not found" });
        }
        await route.fulfill({
            status: 200,
            contentType: "text/html; charset=utf-8",
            headers: { "cache-control": "no-store" },
            body,
        });
    });

    await context.route("https://generic-media.mock.invalid/**", async (route) => {
        const url = new URL(route.request().url());
        const corsHeaders = {
            "access-control-allow-origin": "*",
            "cache-control": "no-store",
        };
        if (url.pathname === "/hls/master.m3u8") {
            return await route.fulfill({
                status: 200,
                contentType: "application/vnd.apple.mpegurl",
                headers: corsHeaders,
                body: buildGenericHlsMasterM3u8(),
            });
        }
        if (url.pathname.startsWith("/hls/") && url.pathname.endsWith(".m3u8")) {
            const quality = url.pathname.includes("1080p")
                ? "1080p"
                : url.pathname.includes("720p")
                  ? "720p"
                  : "480p";
            return await route.fulfill({
                status: 200,
                contentType: "application/vnd.apple.mpegurl",
                headers: corsHeaders,
                body: buildGenericHlsVodVariantM3u8(quality),
            });
        }
        if (url.pathname === "/dash/manifest.mpd") {
            return await route.fulfill({
                status: 200,
                contentType: "application/dash+xml",
                headers: corsHeaders,
                body: buildGenericDashMpd(),
            });
        }
        const directSize = DIRECT_VIDEO_SIZES[url.pathname];
        if (directSize !== undefined) {
            if (route.request().method() === "HEAD") {
                return await route.fulfill({
                    status: 200,
                    headers: {
                        ...corsHeaders,
                        "content-type": "video/mp4",
                        "content-length": String(directSize),
                    },
                    body: Buffer.alloc(0),
                });
            }
            return await route.fulfill({
                status: 206,
                headers: {
                    ...corsHeaders,
                    "content-type": "video/mp4",
                    "content-range": `bytes 0-0/${directSize}`,
                    "content-length": "1",
                },
                body: Buffer.alloc(1),
            });
        }
        await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
    });
}

export async function uninstallPlatformRoutes(context: BrowserContext): Promise<void> {
    for (const pattern of PLATFORM_ROUTE_PATTERNS) {
        await context.unroute(pattern).catch(() => {});
    }
}
