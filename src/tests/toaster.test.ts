import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { toDateKey } from "@lib/dateUtils";
import { toasterSuppressedDate } from "@lib/storage";

import { youtubeAdapter } from "@/adapters/youtubeAdapter";
import { showPlatformToast, unmountToast } from "@/entrypoints/content/toaster";
import { setLanguage } from "@/i18n/language";
import type { YoutubeData } from "@/types/platforms.types";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;
let testDay = 1;

function nextTestDay(): Date {
    return new Date(2026, 5, testDay++, 12, 0, 0);
}

beforeEach(async () => {
    setSystemTime(nextTestDay());
    cleanupDom = installDomEnv();
    await setLanguage("en");
});

afterEach(async () => {
    unmountToast();
    setSystemTime();
    await setLanguage("en");
    await cleanupDom?.();
    cleanupDom = undefined;
});

const vodData: YoutubeData = {
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
            formatId: 136,
            height: 720,
            sizeBytes: 300_000_000,
            sizePerSecondBytes: 83_333,
        },
    ],
};

const liveData: YoutubeData = {
    platform: "youtube",
    type: "live",
    title: "High Bitrate Live",
    channelName: "Streamer",
    thumbnailUrl: undefined,
    channelUrl: undefined,
    formats: [
        {
            type: "live",
            resolution: 1080,
            sizePerSecondBytes: 250_000,
        },
    ],
};

describe("showPlatformToast", () => {
    test("mounts total and hourly usage for VOD exceeding threshold and skips below threshold", async () => {
        await showPlatformToast(youtubeAdapter, vodData, 720, 500);
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await showPlatformToast(youtubeAdapter, vodData, 480, 500);
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        const host = document.querySelector("#TubeSize-Toast-Host");
        expect(host).not.toBeNull();
        expect(host?.textContent).toContain("Current Quality: 2160p");
        expect(host?.textContent).toContain("Total Usage: 900 MB");
        expect(host?.textContent).toContain("Per Hour Usage: 900 MB");
        expect(host?.querySelector(".container")?.getAttribute("dir")).toBe("ltr");
    });

    test("renders hourly usage without total size on live streams and supports Arabic RTL", async () => {
        await setLanguage("ar");

        await showPlatformToast(youtubeAdapter, liveData, 1080, 500);
        const host = document.querySelector("#TubeSize-Toast-Host");
        expect(host).not.toBeNull();
        expect(host?.querySelector(".container")?.getAttribute("dir")).toBe("rtl");
        expect(host?.querySelector(".container")?.getAttribute("lang")).toBe("ar");
        expect(host?.textContent).not.toContain("Total Usage:");
    });

    test("OK button unmounts toast without suppressing future alerts on the same day", async () => {
        await showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        const okBtn = document.querySelector<HTMLButtonElement>(
            "#TubeSize-Toast-Host button.firstBtn",
        );
        expect(okBtn?.textContent).toBe("OK");

        okBtn?.click();
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
        expect(await toasterSuppressedDate.getValue()).toBeNull();

        await showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        expect(document.querySelector("#TubeSize-Toast-Host")).not.toBeNull();
    });

    test("Don't show again persists today's DateKey and suppresses further toasts for that day", async () => {
        const expectedDate = toDateKey("2026-06-04");
        expect(expectedDate).toBeDefined();

        setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
        await showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        const buttons = document.querySelectorAll<HTMLButtonElement>("#TubeSize-Toast-Host button");
        const suppressBtn = buttons[1];
        expect(suppressBtn?.textContent).toBe("Don't show again for today");

        suppressBtn?.click();
        await Promise.resolve();

        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
        expect(await toasterSuppressedDate.getValue()).toBe(expectedDate!);

        await showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("unmountToast cancels an in-flight showPlatformToast call", async () => {
        const pending = showPlatformToast(youtubeAdapter, vodData, 2160, 500);
        unmountToast();
        await pending;

        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });
});
