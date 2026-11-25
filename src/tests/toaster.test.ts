import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { toDateKey } from "@lib/dateUtils";
import { toasterSuppressedDate } from "@lib/storage";

import type { DisplayFormat } from "@/adapters/types";
import { createToaster, unmountToast } from "@/entrypoints/content/toaster";
import { setLanguage } from "@/i18n/language";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;

beforeEach(async () => {
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

const vodFormats: DisplayFormat[] = [
    {
        kind: "vod",
        key: 313,
        resolution: 2160,
        sizeBytes: 900_000_000,
        sizePerSecondBytes: 250_000,
    },
    {
        kind: "vod",
        key: 136,
        resolution: 720,
        sizeBytes: 300_000_000,
        sizePerSecondBytes: 83_333,
    },
];

const liveFormats: DisplayFormat[] = [
    {
        kind: "live",
        key: 1080,
        resolution: 1080,
        sizePerSecondBytes: 250_000,
    },
];

describe("createToaster", () => {
    test("mounts total and hourly usage for VOD exceeding threshold and skips below threshold", async () => {
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 720, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 480, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const host = document.querySelector("#TubeSize-Toast-Host");
        expect(host).not.toBeNull();
        expect(host?.textContent).toContain("Current Quality: 2160p");
        expect(host?.textContent).toContain("Total Usage: 900 MB");
        expect(host?.textContent).toContain("Per Hour Usage: 900 MB");
        expect(host?.querySelector(".container")?.getAttribute("dir")).toBe("ltr");
    });

    test("renders hourly usage without total size on live streams and supports Arabic RTL", async () => {
        await setLanguage("ar");
        const toaster = createToaster();

        await toaster.show({ formats: liveFormats, currentQuality: 1080, thresholdMbph: 500 });
        const host = document.querySelector("#TubeSize-Toast-Host");
        expect(host).not.toBeNull();
        expect(host?.querySelector(".container")?.getAttribute("dir")).toBe("rtl");
        expect(host?.querySelector(".container")?.getAttribute("lang")).toBe("ar");
        expect(host?.textContent).not.toContain("Total Usage:");
    });

    test("OK button unmounts toast without suppressing future alerts on the same day", async () => {
        const controller = new AbortController();
        const toaster = createToaster(controller.signal);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const okBtn = document.querySelector<HTMLButtonElement>(
            "#TubeSize-Toast-Host button.firstBtn",
        );
        expect(okBtn?.textContent).toBe("OK");

        okBtn?.click();
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
        expect(await toasterSuppressedDate.getValue()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).not.toBeNull();

        controller.abort();
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("clicking OK cancels a pending show call while keeping future resolution alerts active", async () => {
        const controller = new AbortController();
        const toaster = createToaster(controller.signal);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const okBtn = document.querySelector<HTMLButtonElement>(
            "#TubeSize-Toast-Host button.firstBtn",
        );

        const pendingShow = toaster.show({
            formats: vodFormats,
            currentQuality: 2160,
            thresholdMbph: 500,
        });
        okBtn?.click();
        await pendingShow;

        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).not.toBeNull();
    });

    test("Don't show again persists today's DateKey and suppresses further toasts for that day", async () => {
        const expectedDate = toDateKey("2026-06-04");
        expect(expectedDate).toBeDefined();
        const toaster = createToaster();

        setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const buttons = document.querySelectorAll<HTMLButtonElement>("#TubeSize-Toast-Host button");
        const suppressBtn = buttons[1];
        expect(suppressBtn?.textContent).toBe("Don't show again for today");

        suppressBtn?.click();
        await Promise.resolve();

        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
        expect(await toasterSuppressedDate.getValue()).toBe(expectedDate!);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });

    test("does not leak suppression state across tests on the same calendar day", async () => {
        setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(document.querySelector("#TubeSize-Toast-Host")).not.toBeNull();
    });

    test("aborting signal cancels an in-flight show call", async () => {
        const controller = new AbortController();
        const toaster = createToaster(controller.signal);

        const pending = toaster.show({
            formats: vodFormats,
            currentQuality: 2160,
            thresholdMbph: 500,
        });
        controller.abort();
        await pending;

        expect(document.querySelector("#TubeSize-Toast-Host")).toBeNull();
    });
});
