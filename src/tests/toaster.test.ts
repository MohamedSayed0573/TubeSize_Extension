import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import type { DisplayFormat } from "@app-types/platforms.types";
import { toDateKey } from "@lib/dateUtils";
import { storage } from "@wxt-dev/storage";

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
        key: 271,
        resolution: 1440,
        sizeBytes: 600_000_000,
        sizePerSecondBytes: 180_000,
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

function getToastHost(): HTMLElement | null {
    return document.querySelector("#TubeSize-Toast-Host");
}

function getToastShadowRoot(): ShadowRoot | null {
    return getToastHost()?.shadowRoot ?? null;
}

describe("createToaster", () => {
    test("mounts total and hourly usage inside an open Shadow DOM with encapsulated styles and skips below threshold", async () => {
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 720, thresholdMbph: 500 });
        expect(getToastHost()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 480, thresholdMbph: 500 });
        expect(getToastHost()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const host = getToastHost();
        expect(host).not.toBeNull();
        expect(host?.childNodes).toHaveLength(0);
        expect(host?.querySelector(".container")).toBeNull();

        const shadowRoot = host?.shadowRoot;
        expect(shadowRoot).not.toBeNull();

        const styles = shadowRoot?.querySelectorAll("style");
        expect(styles).toHaveLength(1);
        expect(styles?.[0]?.textContent).toContain(":host");
        expect(styles?.[0]?.textContent).toContain("all: initial");
        expect(styles?.[0]?.textContent).toContain(".container");

        const container = shadowRoot?.querySelector(".container");
        expect(container).not.toBeNull();
        expect(container?.textContent).toContain("Current Quality: 2160p");
        expect(container?.textContent).toContain("Total Usage: 900 MB");
        expect(container?.textContent).toContain("Per Hour Usage: 900 MB");
        expect(container?.getAttribute("dir")).toBe("ltr");
    });

    test("re-mounting updates toast content inside the existing Shadow DOM without duplicating style nodes", async () => {
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const initialHost = getToastHost();
        const initialShadowRoot = getToastShadowRoot();
        const initialStyle = initialShadowRoot?.querySelector("style");
        expect(initialShadowRoot?.querySelector(".container")?.textContent).toContain(
            "Current Quality: 2160p",
        );

        await toaster.show({ formats: vodFormats, currentQuality: 1440, thresholdMbph: 500 });
        const updatedHost = getToastHost();
        const updatedShadowRoot = getToastShadowRoot();
        expect(updatedHost).toBe(initialHost);
        expect(updatedShadowRoot).toBe(initialShadowRoot);
        expect(updatedShadowRoot?.querySelectorAll("style")).toHaveLength(1);
        expect(updatedShadowRoot?.querySelector("style")).toBe(initialStyle);
        expect(updatedShadowRoot?.querySelectorAll(".container")).toHaveLength(1);
        expect(updatedShadowRoot?.querySelector(".container")?.textContent).toContain(
            "Current Quality: 1440p",
        );
        expect(updatedShadowRoot?.querySelector(".container")?.textContent).toContain(
            "Total Usage: 600 MB",
        );
    });

    test("renders hourly usage without total size on live streams and supports Arabic RTL inside Shadow DOM", async () => {
        await setLanguage("ar");
        const toaster = createToaster();

        await toaster.show({ formats: liveFormats, currentQuality: 1080, thresholdMbph: 500 });
        const host = getToastHost();
        expect(host).not.toBeNull();
        expect(host?.childNodes).toHaveLength(0);

        const container = host?.shadowRoot?.querySelector(".container");
        expect(container?.getAttribute("dir")).toBe("rtl");
        expect(container?.getAttribute("lang")).toBe("ar");
        expect(container?.textContent).not.toContain("Total Usage:");
    });

    test("OK button inside Shadow DOM unmounts toast without suppressing future alerts on the same day", async () => {
        const controller = new AbortController();
        const toaster = createToaster(controller.signal);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const okBtn = getToastShadowRoot()?.querySelector<HTMLButtonElement>("button.firstBtn");
        expect(okBtn?.textContent).toBe("OK");

        okBtn?.click();
        expect(getToastHost()).toBeNull();
        expect(await storage.getItem("local:toasterSuppressedDate")).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();

        controller.abort();
        expect(getToastHost()).toBeNull();
    });

    test("clicking OK cancels a pending show call while keeping future resolution alerts active", async () => {
        const controller = new AbortController();
        const toaster = createToaster(controller.signal);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const okBtn = getToastShadowRoot()?.querySelector<HTMLButtonElement>("button.firstBtn");

        const pendingShow = toaster.show({
            formats: vodFormats,
            currentQuality: 2160,
            thresholdMbph: 500,
        });
        okBtn?.click();
        await pendingShow;

        expect(getToastHost()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();
    });

    test("Don't show again inside Shadow DOM persists today's DateKey and suppresses further toasts for that day", async () => {
        const expectedDate = toDateKey("2026-06-04");
        expect(expectedDate).toBeDefined();
        const toaster = createToaster();

        setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        const buttons = getToastShadowRoot()?.querySelectorAll<HTMLButtonElement>("button");
        const suppressBtn = buttons?.[1];
        expect(suppressBtn?.textContent).toBe("Don't show again for today");

        suppressBtn?.click();
        await Promise.resolve();

        expect(getToastHost()).toBeNull();
        expect(await storage.getItem("local:toasterSuppressedDate")).toBe(expectedDate!);

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).toBeNull();
    });

    test("does not leak suppression state across tests on the same calendar day", async () => {
        setSystemTime(new Date(2026, 5, 4, 12, 0, 0));
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();
    });

    test("unmounts an existing toast when quality drops at or below threshold or becomes unmapped", async () => {
        const toaster = createToaster();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 720, thresholdMbph: 500 });
        expect(getToastHost()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();

        // Exact threshold boundary (250_000 B/s * 3600 = 900 MB/h <= 900)
        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 900 });
        expect(getToastHost()).toBeNull();

        await toaster.show({ formats: vodFormats, currentQuality: 2160, thresholdMbph: 500 });
        expect(getToastHost()).not.toBeNull();

        // Unmapped resolution (not present in vodFormats)
        await toaster.show({ formats: vodFormats, currentQuality: 480, thresholdMbph: 500 });
        expect(getToastHost()).toBeNull();
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

        expect(getToastHost()).toBeNull();
    });
});
