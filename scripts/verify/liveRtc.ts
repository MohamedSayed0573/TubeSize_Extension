import type { Page } from "playwright-core";

import { launchExtension, type RuntimeIssue } from "./browser";
import { applySeed, inspectDb } from "./seed";

const VDO_NINJA_ORIGIN = "https://vdo.ninja";
const STREAM_WARMUP_MS = 2_500;
const STEADY_STATE_SAMPLE_MS = 6_000;
const MIN_RTC_DELTA_BYTES = 50_000;
const MIN_ACCURACY_RATIO = 0.75;
const MAX_ACCURACY_RATIO = 1.3;

const RTC_GROUND_TRUTH_INIT_SCRIPT = `
(() => {
    const Orig = window.RTCPeerConnection;
    if (typeof Orig !== "function") return;
    const pcs = [];
    window.tsGroundTruthPcs = pcs;
    const Wrapped = function(...args) {
        const pc = new Orig(...args);
        pcs.push(pc);
        return pc;
    };
    Wrapped.prototype = Orig.prototype;
    Object.setPrototypeOf(Wrapped, Orig);
    window.RTCPeerConnection = Wrapped;
})();
`;

interface TabRtcSnapshot {
    pcCount: number;
    states: string[];
    transportBytes: number;
}

export interface LiveRtcReport {
    status: "passed" | "failed" | "inconclusive";
    extId: string;
    origin: string;
    streamId: string;
    durationMs: number;
    rtcTransportDeltaBytes: number;
    tubeSizeDeltaBytes: number;
    tubeSizeTotalBytes: number;
    ratio: number | null;
    badgeText: string;
    publisherStates: string[];
    viewerStates: string[];
    issues: RuntimeIssue[];
    error?: string;
}

async function readTabRtcSnapshot(page: Page): Promise<TabRtcSnapshot> {
    return await page.evaluate(async () => {
        const win = window as unknown as {
            tsGroundTruthPcs?: RTCPeerConnection[];
        };
        const pcs = win.tsGroundTruthPcs ?? [];
        const states: string[] = [];
        let transportBytes = 0;

        for (const pc of pcs) {
            states.push(pc.connectionState || pc.iceConnectionState || "unknown");
            try {
                const stats = await pc.getStats();
                stats.forEach((report) => {
                    if (report.type === "transport") {
                        const r = report as { bytesReceived?: number; bytesSent?: number };
                        transportBytes += (r.bytesReceived ?? 0) + (r.bytesSent ?? 0);
                    }
                });
            } catch {
                // Closed peer connection.
            }
        }

        return { pcCount: pcs.length, states, transportBytes };
    });
}

function isExtensionIssue(issue: RuntimeIssue, extId: string): boolean {
    if (issue.source === "service-worker" || issue.source === "network") return true;
    return (
        issue.message.includes(`chrome-extension://${extId}`) ||
        issue.message.includes("TubeSize") ||
        issue.message.includes("TUBESIZE")
    );
}

export async function runLiveRtc(opts: {
    extDir: string;
    timeoutMs: number;
}): Promise<LiveRtcReport> {
    const startedAt = performance.now();
    const streamId = `tslive${Math.random().toString(36).slice(2, 10)}`;
    let browser: Awaited<ReturnType<typeof launchExtension>> | null = null;
    let cleanupPromise: Promise<void> | null = null;

    const cleanup = (): Promise<void> => {
        if (cleanupPromise) return cleanupPromise;
        cleanupPromise = (async () => {
            if (browser) {
                const active = browser;
                browser = null;
                await active.close().catch(() => {});
            }
        })();
        return cleanupPromise;
    };

    const onSignal = (signal: NodeJS.Signals) => {
        void cleanup().finally(() => {
            process.exit(signal === "SIGINT" ? 130 : 143);
        });
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);

    let extId = "";
    let rtcTransportDeltaBytes = 0;
    let tubeSizeDeltaBytes = 0;
    let tubeSizeTotalBytes = 0;
    let ratio: number | null = null;
    let badgeText = "";
    let publisherStates: string[] = [];
    let viewerStates: string[] = [];

    try {
        browser = await launchExtension(opts.extDir, opts.timeoutMs, {
            extraArgs: [
                "--use-fake-device-for-media-stream",
                "--use-fake-ui-for-media-stream",
                "--autoplay-policy=no-user-gesture-required",
            ],
        });
        extId = browser.extId;
        const { context, page: pubPage, serviceWorker, issues } = browser;

        await applySeed(serviceWorker, "empty");
        await serviceWorker.evaluate(async () => {
            await chrome.action.setBadgeText({ text: "" });
        });

        await pubPage.addInitScript(RTC_GROUND_TRUTH_INIT_SCRIPT);
        const viewPage = await context.newPage();
        await viewPage.addInitScript(RTC_GROUND_TRUTH_INIT_SCRIPT);

        const navTimeoutMs = Math.min(opts.timeoutMs, 25_000);
        try {
            await Promise.all([
                pubPage.goto(`${VDO_NINJA_ORIGIN}/?push=${streamId}&autostart&webcam&quality=1`, {
                    waitUntil: "domcontentloaded",
                    timeout: navTimeoutMs,
                }),
                viewPage.goto(`${VDO_NINJA_ORIGIN}/?view=${streamId}&autoplay&muted`, {
                    waitUntil: "domcontentloaded",
                    timeout: navTimeoutMs,
                }),
            ]);
        } catch (err) {
            return {
                status: "inconclusive",
                extId,
                origin: VDO_NINJA_ORIGIN,
                streamId,
                durationMs: Math.round(performance.now() - startedAt),
                rtcTransportDeltaBytes,
                tubeSizeDeltaBytes,
                tubeSizeTotalBytes,
                ratio,
                badgeText,
                publisherStates,
                viewerStates,
                issues: issues.filter((i) => isExtensionIssue(i, extId)),
                error: `Unable to reach ${VDO_NINJA_ORIGIN}: ${err instanceof Error ? err.message : String(err)}`,
            };
        }

        // Wait for both tabs to establish connected RTCPeerConnections with active transport bytes.
        const connectDeadline = Date.now() + Math.min(opts.timeoutMs, 25_000);
        let connected = false;
        while (Date.now() < connectDeadline) {
            const [pubSnap, viewSnap] = await Promise.all([
                readTabRtcSnapshot(pubPage),
                readTabRtcSnapshot(viewPage),
            ]);
            publisherStates = pubSnap.states;
            viewerStates = viewSnap.states;
            if (
                pubSnap.states.includes("connected") &&
                viewSnap.states.includes("connected") &&
                pubSnap.transportBytes > 0 &&
                viewSnap.transportBytes > 0
            ) {
                connected = true;
                break;
            }
            await Bun.sleep(500);
        }

        if (!connected) {
            return {
                status: "inconclusive",
                extId,
                origin: VDO_NINJA_ORIGIN,
                streamId,
                durationMs: Math.round(performance.now() - startedAt),
                rtcTransportDeltaBytes,
                tubeSizeDeltaBytes,
                tubeSizeTotalBytes,
                ratio,
                badgeText,
                publisherStates,
                viewerStates,
                issues: issues.filter((i) => isExtensionIssue(i, extId)),
                error: `VDO.Ninja WebRTC stream did not connect before timeout (publisher=${JSON.stringify(publisherStates)}, viewer=${JSON.stringify(viewerStates)}).`,
            };
        }

        // Let initial page/signaling load settle before measuring steady-state streaming.
        await Bun.sleep(STREAM_WARMUP_MS);

        const [pubBefore, viewBefore, dbBefore] = await Promise.all([
            readTabRtcSnapshot(pubPage),
            readTabRtcSnapshot(viewPage),
            inspectDb(serviceWorker),
        ]);
        const tsBefore = dbBefore.todayUsage[VDO_NINJA_ORIGIN] ?? 0;

        await Bun.sleep(STEADY_STATE_SAMPLE_MS);

        const [pubAfter, viewAfter, dbAfter, currentBadge] = await Promise.all([
            readTabRtcSnapshot(pubPage),
            readTabRtcSnapshot(viewPage),
            inspectDb(serviceWorker),
            serviceWorker.evaluate(async () => await chrome.action.getBadgeText({})),
        ]);

        publisherStates = pubAfter.states;
        viewerStates = viewAfter.states;
        badgeText = currentBadge;
        tubeSizeTotalBytes = dbAfter.todayUsage[VDO_NINJA_ORIGIN] ?? 0;
        tubeSizeDeltaBytes = tubeSizeTotalBytes - tsBefore;
        rtcTransportDeltaBytes =
            pubAfter.transportBytes -
            pubBefore.transportBytes +
            (viewAfter.transportBytes - viewBefore.transportBytes);
        ratio =
            rtcTransportDeltaBytes > 0
                ? Number((tubeSizeDeltaBytes / rtcTransportDeltaBytes).toFixed(3))
                : null;

        const extensionIssues = issues.filter((i) => isExtensionIssue(i, extId));

        if (rtcTransportDeltaBytes < MIN_RTC_DELTA_BYTES) {
            return {
                status: "inconclusive",
                extId,
                origin: VDO_NINJA_ORIGIN,
                streamId,
                durationMs: Math.round(performance.now() - startedAt),
                rtcTransportDeltaBytes,
                tubeSizeDeltaBytes,
                tubeSizeTotalBytes,
                ratio,
                badgeText,
                publisherStates,
                viewerStates,
                issues: extensionIssues,
                error: `Remote WebRTC transport stalled during steady-state window (${rtcTransportDeltaBytes} B < ${MIN_RTC_DELTA_BYTES} B).`,
            };
        }

        const failures: string[] = [];
        if (tubeSizeDeltaBytes <= 0) {
            failures.push(
                `Expected positive TubeSize delta for ${VDO_NINJA_ORIGIN}, got ${tubeSizeDeltaBytes}`,
            );
        } else if (ratio === null || ratio < MIN_ACCURACY_RATIO || ratio > MAX_ACCURACY_RATIO) {
            failures.push(
                `TubeSize/RTCTransport ratio ${String(ratio)} outside expected range [${MIN_ACCURACY_RATIO}, ${MAX_ACCURACY_RATIO}]`,
            );
        }
        if (!badgeText.trim()) {
            failures.push("Expected non-empty toolbar badge text");
        }
        if (extensionIssues.length > 0) {
            failures.push(
                `${extensionIssues.length} extension issue(s): ${extensionIssues.map((i) => `${i.source}/${i.level}: ${i.message}`).join("; ")}`,
            );
        }

        return {
            status: failures.length === 0 ? "passed" : "failed",
            extId,
            origin: VDO_NINJA_ORIGIN,
            streamId,
            durationMs: Math.round(performance.now() - startedAt),
            rtcTransportDeltaBytes,
            tubeSizeDeltaBytes,
            tubeSizeTotalBytes,
            ratio,
            badgeText,
            publisherStates,
            viewerStates,
            issues: extensionIssues,
            ...(failures.length > 0 ? { error: failures.join("; ") } : {}),
        };
    } finally {
        process.off("SIGINT", onSignal);
        process.off("SIGTERM", onSignal);
        await cleanup();
    }
}
