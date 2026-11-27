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
    "fixture:realtime-call",
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
        case "fixture:realtime-call":
            return {
                url: `http://127.0.0.1:${serverPort}/__fixture__/realtime-call`,
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

export const REALTIME_WS_EXPECTED_BYTES = 140_013;
export const REALTIME_MODULE_WORKER_EXPECTED_BYTES = 140_013;

export function upgradeFixtureWebSocket(
    req: Request,
    server: { upgrade(req: Request): boolean },
): boolean {
    const url = new URL(req.url);
    if (url.pathname !== "/__fixture__/ws") return false;
    return server.upgrade(req);
}

export const FIXTURE_WEBSOCKET_HANDLER: Bun.WebSocketHandler<undefined> = {
    message(ws, message) {
        if (typeof message === "string") {
            if (message.startsWith("send:")) {
                const raw = Number(message.slice("send:".length));
                const size = Number.isFinite(raw)
                    ? Math.min(Math.max(Math.floor(raw), 1), 1_000_000)
                    : 1;
                const payload = new Uint8Array(size);
                for (let i = 0; i < size; i++) payload[i] = i & 0xff;
                ws.send(payload);
                return;
            }
            if (message.startsWith("echo:")) {
                ws.send(message);
                return;
            }
            ws.send("ok");
            return;
        }
        ws.send("ack");
    },
};

function chunkedHtmlResponse(html: string): Response {
    const htmlBytes = new TextEncoder().encode(html);
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

function realtimeCallHtml(): string {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <link rel="icon" href="data:," />
  <title>TubeSize Realtime Call Fixture</title>
</head>
<body>
  <h1>TubeSize Realtime Call Fixture</h1>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">
    <button type="button" id="btn-ws">Run WebSocket exchange</button>
    <button type="button" id="btn-module-worker">Run module worker</button>
    <button type="button" id="btn-webrtc">Run WebRTC loopback call</button>
    <button type="button" id="btn-run-call">Run full call simulation</button>
  </div>
  <div style="display:flex;gap:12px;align-items:center;margin:12px 0">
    <canvas id="rtc-canvas" width="160" height="120" style="border:1px solid #333"></canvas>
    <video id="rtc-remote-video" muted autoplay playsinline style="width:160px;height:120px;background:#111"></video>
  </div>
  <div style="display:flex;flex-direction:column;gap:4px">
    <output id="ws-status">Idle</output>
    <output id="worker-status">Idle</output>
    <output id="webrtc-status">Idle</output>
    <output id="call-status">Idle</output>
  </div>
  <script>
    const wsStatusEl = document.getElementById("ws-status");
    const workerStatusEl = document.getElementById("worker-status");
    const webrtcStatusEl = document.getElementById("webrtc-status");
    const callStatusEl = document.getElementById("call-status");

    function createWsReader(ws) {
      return () =>
        new Promise((resolve, reject) => {
          const onMessage = (ev) => {
            cleanup();
            resolve(ev.data);
          };
          const onError = () => {
            cleanup();
            reject(new Error("WebSocket error"));
          };
          const onClose = () => {
            cleanup();
            reject(new Error("WebSocket closed before response"));
          };
          const cleanup = () => {
            ws.removeEventListener("message", onMessage);
            ws.removeEventListener("error", onError);
            ws.removeEventListener("close", onClose);
          };
          ws.addEventListener("message", onMessage);
          ws.addEventListener("error", onError);
          ws.addEventListener("close", onClose);
        });
    }

    async function runWebSocket() {
      wsStatusEl.textContent = "Running WebSocket...";
      const ws = new WebSocket("ws://" + location.host + "/__fixture__/ws");
      ws.binaryType = "arraybuffer";
      await new Promise((resolve, reject) => {
        ws.addEventListener("open", () => resolve(), { once: true });
        ws.addEventListener("error", () => reject(new Error("WebSocket open failed")), { once: true });
      });
      const nextMessage = createWsReader(ws);

      const echoPayload = "echo:" + "a".repeat(19995);
      const p1 = nextMessage();
      ws.send(echoPayload);
      const r1 = await p1;
      if (typeof r1 !== "string" || r1.length !== 20000) {
        throw new Error("Unexpected WebSocket echo length");
      }

      const binOut = new Uint8Array(40000);
      for (let i = 0; i < binOut.length; i++) binOut[i] = i & 0xff;
      const p2 = nextMessage();
      ws.send(binOut);
      const r2 = await p2;
      if (r2 !== "ack") {
        throw new Error("Unexpected WebSocket binary ack");
      }

      const p3 = nextMessage();
      ws.send("send:60000");
      const r3 = await p3;
      if (!(r3 instanceof ArrayBuffer) || r3.byteLength !== 60000) {
        throw new Error("Unexpected WebSocket server binary frame");
      }

      await new Promise((resolve) => {
        ws.addEventListener("close", () => resolve(), { once: true });
        ws.close(1000, "done");
      });
      wsStatusEl.textContent = "WebSocket ${REALTIME_WS_EXPECTED_BYTES} done";
    }

    async function runModuleWorker() {
      workerStatusEl.textContent = "Running module worker...";
      const source = \`
        const nextMessage = (ws) =>
          new Promise((resolve, reject) => {
            const onMessage = (ev) => {
              cleanup();
              resolve(ev.data);
            };
            const onError = () => {
              cleanup();
              reject(new Error("Worker WebSocket error"));
            };
            const onClose = () => {
              cleanup();
              reject(new Error("Worker WebSocket closed early"));
            };
            const cleanup = () => {
              ws.removeEventListener("message", onMessage);
              ws.removeEventListener("error", onError);
              ws.removeEventListener("close", onClose);
            };
            ws.addEventListener("message", onMessage);
            ws.addEventListener("error", onError);
            ws.addEventListener("close", onClose);
          });

        self.addEventListener("message", async (ev) => {
          const { origin, host } = ev.data;
          const res = await fetch(origin + "/__fixture__/worker-stream?size=90000");
          await res.arrayBuffer();

          const ws = new WebSocket("ws://" + host + "/__fixture__/ws");
          ws.binaryType = "arraybuffer";
          await new Promise((resolve, reject) => {
            ws.addEventListener("open", () => resolve(), { once: true });
            ws.addEventListener("error", () => reject(new Error("Worker WebSocket open failed")), { once: true });
          });

          const binOut = new Uint8Array(20000);
          for (let i = 0; i < binOut.length; i++) binOut[i] = i & 0xff;
          const p1 = nextMessage(ws);
          ws.send(binOut);
          const r1 = await p1;
          if (r1 !== "ack") throw new Error("Unexpected worker WebSocket ack");

          const p2 = nextMessage(ws);
          ws.send("send:30000");
          const r2 = await p2;
          if (!(r2 instanceof ArrayBuffer) || r2.byteLength !== 30000) {
            throw new Error("Unexpected worker WebSocket binary frame");
          }

          await new Promise((resolve) => {
            ws.addEventListener("close", () => resolve(), { once: true });
            ws.close(1000, "done");
          });
          self.postMessage("done");
        });
      \`;
      const workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      const worker = new Worker(workerUrl, { type: "module" });
      URL.revokeObjectURL(workerUrl);
      window.__tsWorkers = window.__tsWorkers || [];
      window.__tsWorkers.push(worker);

      await new Promise((resolve, reject) => {
        worker.addEventListener("message", (ev) => {
          if (ev.data === "done") resolve();
        });
        worker.addEventListener("error", (ev) => {
          reject(new Error(ev.message || "Module worker failed"));
        });
        worker.postMessage({ origin: location.origin, host: location.host });
      });
      workerStatusEl.textContent = "Module worker ${REALTIME_MODULE_WORKER_EXPECTED_BYTES} done";
    }

    async function readPeerTransportBytes(pc) {
      const report = await pc.getStats();
      let transportTotal = 0;
      let pairTotal = 0;
      for (const stat of report.values()) {
        const rx = typeof stat.bytesReceived === "number" && stat.bytesReceived > 0 ? stat.bytesReceived : 0;
        const tx = typeof stat.bytesSent === "number" && stat.bytesSent > 0 ? stat.bytesSent : 0;
        if (stat.type === "transport") {
          transportTotal += rx + tx;
        } else if (stat.type === "candidate-pair") {
          pairTotal += rx + tx;
        }
      }
      return transportTotal > 0 ? transportTotal : pairTotal;
    }

    async function runWebRtcCall() {
      webrtcStatusEl.textContent = "Running WebRTC loopback call...";
      delete webrtcStatusEl.dataset.rtcBytes;

      const canvas = document.getElementById("rtc-canvas");
      const ctx = canvas.getContext("2d");
      const remoteVideo = document.getElementById("rtc-remote-video");

      let frame = 0;
      const drawFrame = () => {
        if (!ctx) return;
        ctx.fillStyle = "#111827";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < 6; i++) {
          ctx.fillStyle = "hsl(" + ((frame * 17 + i * 55) % 360) + ", 80%, 55%)";
          const x = (frame * 9 + i * 27) % (canvas.width - 28);
          const y = (frame * 5 + i * 19) % (canvas.height - 28);
          ctx.fillRect(x, y, 28, 28);
        }
        frame += 1;
      };
      drawFrame();
      const drawTimer = setInterval(drawFrame, 50);

      const localPeer = new RTCPeerConnection({ iceServers: [] });
      const remotePeer = new RTCPeerConnection({ iceServers: [] });
      const stream = canvas.captureStream(15);

      try {
        localPeer.addEventListener("icecandidate", (ev) => {
          if (ev.candidate) void remotePeer.addIceCandidate(ev.candidate).catch(() => {});
        });
        remotePeer.addEventListener("icecandidate", (ev) => {
          if (ev.candidate) void localPeer.addIceCandidate(ev.candidate).catch(() => {});
        });

        for (const track of stream.getTracks()) {
          localPeer.addTrack(track, stream);
        }

        remotePeer.addEventListener("track", (ev) => {
          remoteVideo.srcObject = ev.streams[0] || new MediaStream([ev.track]);
          void remoteVideo.play().catch(() => {});
        });

        const dcChunk = new Uint8Array(16000);
        for (let i = 0; i < dcChunk.length; i++) dcChunk[i] = (i * 31) & 0xff;

        const dc = localPeer.createDataChannel("call-media");
        dc.binaryType = "arraybuffer";

        const dcDone = new Promise((resolve, reject) => {
          let localReceived = 0;
          let remoteReceived = 0;

          dc.addEventListener("error", () => reject(new Error("Local data channel error")));
          dc.addEventListener("open", () => {
            for (let i = 0; i < 8; i++) dc.send(dcChunk);
          });
          dc.addEventListener("message", (ev) => {
            localReceived += ev.data instanceof ArrayBuffer ? ev.data.byteLength : 0;
            if (localReceived >= 4 * 16000) resolve();
          });

          remotePeer.addEventListener("datachannel", (ev) => {
            const remoteDc = ev.channel;
            remoteDc.binaryType = "arraybuffer";
            remoteDc.addEventListener("error", () => reject(new Error("Remote data channel error")));
            remoteDc.addEventListener("message", (msgEv) => {
              remoteReceived += msgEv.data instanceof ArrayBuffer ? msgEv.data.byteLength : 0;
              if (remoteReceived >= 8 * 16000) {
                for (let i = 0; i < 4; i++) remoteDc.send(dcChunk);
              }
            });
          });
        });

        const offer = await localPeer.createOffer();
        await localPeer.setLocalDescription(offer);
        await remotePeer.setRemoteDescription(offer);
        const answer = await remotePeer.createAnswer();
        await remotePeer.setLocalDescription(answer);
        await localPeer.setRemoteDescription(answer);

        await dcDone;
        await new Promise((resolve) => setTimeout(resolve, 500));

        clearInterval(drawTimer);
        for (const track of stream.getTracks()) track.stop();
        await new Promise((resolve) => setTimeout(resolve, 50));

        const [localBytes, remoteBytes] = await Promise.all([
          readPeerTransportBytes(localPeer),
          readPeerTransportBytes(remotePeer),
        ]);
        const totalRtcBytes = Math.round(localBytes + remoteBytes);
        webrtcStatusEl.dataset.rtcBytes = String(totalRtcBytes);

        localPeer.close();
        remotePeer.close();
        remoteVideo.srcObject = null;

        webrtcStatusEl.textContent = "WebRTC call done: " + totalRtcBytes + " transport bytes";
      } catch (err) {
        clearInterval(drawTimer);
        for (const track of stream.getTracks()) track.stop();
        localPeer.close();
        remotePeer.close();
        remoteVideo.srcObject = null;
        throw err;
      }
    }

    document.getElementById("btn-ws").addEventListener("click", () => {
      void runWebSocket().catch((err) => {
        wsStatusEl.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
        throw err;
      });
    });
    document.getElementById("btn-module-worker").addEventListener("click", () => {
      void runModuleWorker().catch((err) => {
        workerStatusEl.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
        throw err;
      });
    });
    document.getElementById("btn-webrtc").addEventListener("click", () => {
      void runWebRtcCall().catch((err) => {
        webrtcStatusEl.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
        throw err;
      });
    });
    document.getElementById("btn-run-call").addEventListener("click", () => {
      void (async () => {
        callStatusEl.textContent = "Running full call simulation...";
        await runWebSocket();
        await runModuleWorker();
        await runWebRtcCall();
        callStatusEl.textContent = "Full call simulation done";
      })().catch((err) => {
        callStatusEl.textContent = "Error: " + (err instanceof Error ? err.message : String(err));
        throw err;
      });
    });
  </script>
</body>
</html>`;
}

export function handleUsageFixtureRequest(req: Request): Response | null {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/__fixture__/")) return null;

    if (url.pathname === "/__fixture__/usage-site") {
        return chunkedHtmlResponse(usageSiteHtml());
    }

    if (url.pathname === "/__fixture__/realtime-call") {
        return chunkedHtmlResponse(realtimeCallHtml());
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
                : url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/")
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
}

export async function uninstallPlatformRoutes(context: BrowserContext): Promise<void> {
    for (const pattern of PLATFORM_ROUTE_PATTERNS) {
        await context.unroute(pattern).catch(() => {});
    }
}
