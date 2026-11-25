import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { KickLiveData, TwitchLiveData, YoutubeData } from "@app-types/platforms.types";
import type { KickLiveMessage, TwitchLiveMessage, YoutubeMessage } from "@app-types/types";
import { saveSettings } from "@lib/settings";

import {
    type ContentSession,
    createContentSession,
    isSamePageNavigation,
} from "@/entrypoints/content/contentSession";
import { setLanguage } from "@/i18n/language";
import { onMessage } from "@/messaging";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;
let session: ContentSession | undefined;
const messageCleanups: Array<() => void> = [];

function createVideo(height: number): HTMLVideoElement {
    const video = document.createElement("video");
    Object.defineProperty(video, "videoHeight", {
        value: height,
        configurable: true,
    });
    return video;
}

function createYoutubeQualityMenu(labels: string[]) {
    const settingsMenu = document.createElement("div");
    settingsMenu.className = "ytp-settings-menu";

    const qualityPanel = document.createElement("div");
    qualityPanel.className = "ytp-panel ytp-quality-menu";

    const panelMenu = document.createElement("div");
    panelMenu.className = "ytp-panel-menu";

    for (const label of labels) {
        const menuItem = document.createElement("div");
        menuItem.className = "ytp-menuitem";
        const itemLabel = document.createElement("div");
        itemLabel.className = "ytp-menuitem-label";
        const innerDiv = document.createElement("div");
        const span = document.createElement("span");
        span.textContent = label;
        innerDiv.append(span);
        itemLabel.append(innerDiv);
        menuItem.append(itemLabel);
        panelMenu.append(menuItem);
    }

    qualityPanel.append(panelMenu);
    settingsMenu.append(qualityPanel);
    document.body.append(settingsMenu);
    return settingsMenu;
}

async function waitForCondition(predicate: () => boolean, maxAttempts = 100): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(predicate()).toBe(true);
}

const HIGH_BITRATE_VOD: YoutubeData = {
    platform: "youtube",
    type: "vod",
    title: "High Bitrate VOD",
    durationSeconds: 3600,
    thumbnailUrl: undefined,
    channelName: "Creator",
    channelUrl: undefined,
    formats: [
        {
            type: "vod",
            formatId: 313,
            height: 2160,
            sizeBytes: 900_000_000,
            sizePerSecondBytes: 250_000,
        },
        {
            type: "vod",
            formatId: 137,
            height: 1080,
            sizeBytes: 180_000_000,
            sizePerSecondBytes: 50_000,
        },
    ],
};

const SECOND_YOUTUBE_VOD: YoutubeData = {
    platform: "youtube",
    type: "vod",
    title: "Second VOD",
    durationSeconds: 3600,
    thumbnailUrl: undefined,
    channelName: "Creator 2",
    channelUrl: undefined,
    formats: [
        {
            type: "vod",
            formatId: 313,
            height: 2160,
            sizeBytes: 720_000_000,
            sizePerSecondBytes: 200_000,
        },
    ],
};

const SAMPLE_TWITCH_LIVE: TwitchLiveData = {
    platform: "twitch",
    type: "live",
    channelName: "shroud",
    channelUrl: "https://www.twitch.tv/shroud",
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 500_000 }],
};

const SAMPLE_KICK_LIVE: KickLiveData = {
    platform: "kick",
    type: "live",
    channelName: "xqc",
    channelUrl: "https://kick.com/xqc",
    data: [{ type: "live", resolution: 1080, sizePerSecondBytes: 500_000 }],
};

beforeEach(async () => {
    cleanupDom = installDomEnv("https://www.youtube.com/watch?v=I82j7AzMU80");
    session = createContentSession();
    await setLanguage("en");
    await saveSettings({ toasterEnabled: true, toasterThreshold: 500 });
});

afterEach(async () => {
    while (messageCleanups.length > 0) messageCleanups.pop()?.();
    session?.dispose();
    session = undefined;
    if (cleanupDom) {
        await cleanupDom();
        cleanupDom = undefined;
    }
});

describe("createContentSession", () => {
    test("scrapes ytInitialPlayerResponse only on initial load, injects quality menu badges, and mounts toast", async () => {
        const requests: YoutubeMessage[] = [];
        messageCleanups.push(
            onMessage("youtubeVideo", ({ data }) => {
                requests.push(data);
                return {
                    success: true,
                    data: requests.length === 1 ? HIGH_BITRATE_VOD : SECOND_YOUTUBE_VOD,
                };
            }),
        );

        const script = document.createElement("script");
        script.textContent = "var ytInitialPlayerResponse = { videoDetails: { videoId: '1' } };";
        document.body.append(script);
        createYoutubeQualityMenu(["2160p", "1080p"]);
        document.body.append(createVideo(2160));

        await session!.navigate();
        await waitForCondition(() => document.querySelector("#TubeSize-Toast-Host") !== null);

        expect(requests).toHaveLength(1);
        expect(requests[0]?.mediaId).toBe("I82j7AzMU80");
        expect(requests[0]?.html).toContain("ytInitialPlayerResponse");
        expect(
            [...document.querySelectorAll(".tubesize-quality-menu-panel")].map(
                (el) => el.textContent,
            ),
        ).toEqual(["900 MB", "180 MB"]);
        expect(document.querySelector("#TubeSize-Toast-Host")?.textContent).toContain("900 MB");

        await session!.navigate("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
        await waitForCondition(
            () =>
                document.querySelector("#TubeSize-Toast-Host")?.textContent?.includes("720 MB") ??
                false,
        );

        expect(requests).toHaveLength(2);
        expect(requests[1]?.mediaId).toBe("dQw4w9WgXcQ");
        expect(requests[1]?.html).toBeUndefined();
        expect(
            [...document.querySelectorAll(".tubesize-quality-menu-panel")].map(
                (el) => el.textContent,
            ),
        ).toEqual(["720 MB"]);
    });

    test("skips toaster when toasterEnabled is false while still injecting YouTube quality menu", async () => {
        await saveSettings({ toasterEnabled: false });
        messageCleanups.push(
            onMessage("youtubeVideo", () => ({
                success: true,
                data: HIGH_BITRATE_VOD,
            })),
        );

        createYoutubeQualityMenu(["2160p"]);
        document.body.append(createVideo(2160));

        await session!.navigate();
        await waitForCondition(
            () => document.querySelectorAll(".tubesize-quality-menu-panel").length === 1,
        );

        expect(document.querySelector(".tubesize-quality-menu-panel")?.textContent).toBe("900 MB");
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("clears toast, quality menu badges, and resize tracking when navigating to a non-video page", async () => {
        let requestCount = 0;
        messageCleanups.push(
            onMessage("youtubeVideo", () => {
                requestCount++;
                return { success: true, data: HIGH_BITRATE_VOD };
            }),
        );

        createYoutubeQualityMenu(["2160p"]);
        const video = createVideo(1080);
        document.body.append(video);

        await session!.navigate();
        await waitForCondition(
            () => document.querySelectorAll(".tubesize-quality-menu-panel").length === 1,
        );
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await session!.navigate("https://www.youtube.com/");

        expect(requestCount).toBe(1);
        expect(document.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);

        Object.defineProperty(video, "videoHeight", { value: 2160, configurable: true });
        video.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("cancels stale in-flight navigation when a newer navigation supersedes it", async () => {
        let resolveFirst: ((value: { success: true; data: YoutubeData }) => void) | undefined;

        messageCleanups.push(
            onMessage("youtubeVideo", () => {
                return new Promise((resolve) => {
                    resolveFirst = resolve;
                });
            }),
        );

        createYoutubeQualityMenu(["2160p", "1080p"]);
        document.body.append(createVideo(2160));

        const firstNav = session!.navigate();
        await waitForCondition(() => resolveFirst !== undefined);

        await session!.navigate("https://www.youtube.com/");

        resolveFirst?.({ success: true, data: HIGH_BITRATE_VOD });
        await firstNav;
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(document.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("passes isFromPopup=false for Twitch and Kick live pages and shows live toasts without quality menu injection", async () => {
        const twitchRequests: TwitchLiveMessage[] = [];
        const kickRequests: KickLiveMessage[] = [];
        messageCleanups.push(
            onMessage("twitchLive", ({ data }) => {
                twitchRequests.push(data);
                return { success: true, data: SAMPLE_TWITCH_LIVE };
            }),
            onMessage("kickLive", ({ data }) => {
                kickRequests.push(data);
                return { success: true, data: SAMPLE_KICK_LIVE };
            }),
        );

        document.body.append(createVideo(1080));

        await session!.navigate("https://www.twitch.tv/shroud");
        await waitForCondition(() => document.querySelector("#TubeSize-Toast-Host") !== null);

        expect(twitchRequests).toEqual([{ channelName: "shroud", isFromPopup: false }]);
        expect(document.querySelector("#TubeSize-Toast-Host")?.textContent).toContain(
            "1.8 GB/hour",
        );
        expect(document.querySelector("#TubeSize-Toast-Host")?.textContent).not.toContain(
            "Total Usage:",
        );
        expect(document.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);

        await session!.navigate("https://kick.com/xqc");
        await waitForCondition(() => document.querySelector("#TubeSize-Toast-Host") !== null);

        expect(kickRequests).toEqual([{ channelName: "xqc", isFromPopup: false }]);
        expect(document.querySelector("#TubeSize-Toast-Host")?.textContent).toContain(
            "1.8 GB/hour",
        );
        expect(document.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);
    });

    test("handles SPA transitions across non-media and media routes on Twitch and Kick", async () => {
        const twitchRequests: TwitchLiveMessage[] = [];
        const kickRequests: KickLiveMessage[] = [];
        messageCleanups.push(
            onMessage("twitchLive", ({ data }) => {
                twitchRequests.push(data);
                return { success: true, data: SAMPLE_TWITCH_LIVE };
            }),
            onMessage("kickLive", ({ data }) => {
                kickRequests.push(data);
                return { success: true, data: SAMPLE_KICK_LIVE };
            }),
        );

        document.body.append(createVideo(1080));

        await session!.navigate("https://www.twitch.tv/directory");
        expect(twitchRequests).toHaveLength(0);
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await session!.navigate("https://www.twitch.tv/shroud");
        await waitForCondition(() => document.querySelector("#TubeSize-Toast-Host") !== null);
        expect(twitchRequests).toEqual([{ channelName: "shroud", isFromPopup: false }]);

        await session!.navigate("https://www.twitch.tv/directory");
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await session!.navigate("https://kick.com/browse");
        expect(kickRequests).toHaveLength(0);

        await session!.navigate("https://kick.com/xqc");
        await waitForCondition(() => document.querySelector("#TubeSize-Toast-Host") !== null);
        expect(kickRequests).toEqual([{ channelName: "xqc", isFromPopup: false }]);
    });
});

describe("isSamePageNavigation", () => {
    test("treats hash-only changes as the same page and detects path, search, or origin changes", () => {
        expect(
            isSamePageNavigation(
                new URL("https://www.youtube.com/watch?v=I82j7AzMU80"),
                new URL("https://www.youtube.com/watch?v=I82j7AzMU80#comments"),
            ),
        ).toBe(true);
        expect(
            isSamePageNavigation(
                new URL("https://www.youtube.com/watch?v=I82j7AzMU80"),
                new URL("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ),
        ).toBe(false);
        expect(
            isSamePageNavigation(
                new URL("https://www.twitch.tv/directory"),
                new URL("https://www.twitch.tv/shroud"),
            ),
        ).toBe(false);
        expect(
            isSamePageNavigation(
                new URL("https://www.twitch.tv/shroud"),
                new URL("https://kick.com/shroud"),
            ),
        ).toBe(false);
    });
});
