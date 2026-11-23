import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { youtubeAdapter } from "@/adapters/youtubeAdapter";
import { clearQualityMenu, injectMenu } from "@/entrypoints/content/qualityMenuInjector";
import type { YoutubeData } from "@/types/platforms.types";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;

beforeEach(() => {
    cleanupDom = installDomEnv();
});

afterEach(async () => {
    clearQualityMenu();
    await cleanupDom?.();
    cleanupDom = undefined;
});

function createSettingsMenu(qualityLabels: Array<{ label: string; isPremium?: boolean }> = []) {
    const settingsMenu = document.createElement("div");
    settingsMenu.className = "ytp-settings-menu";

    if (qualityLabels.length > 0) {
        settingsMenu.append(createQualityPanel(qualityLabels));
    }

    document.body.append(settingsMenu);
    return settingsMenu;
}

function createMenuItem(entry: { label: string; isPremium?: boolean }) {
    const menuItem = document.createElement("div");
    menuItem.className = "ytp-menuitem";
    const itemLabel = document.createElement("div");
    itemLabel.className = "ytp-menuitem-label";
    const innerDiv = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = entry.label;
    if (entry.isPremium) {
        const premium = document.createElement("span");
        premium.className = "ytp-premium-label";
        premium.textContent = "Premium";
        span.append(premium);
    }
    innerDiv.append(span);
    itemLabel.append(innerDiv);
    menuItem.append(itemLabel);
    return menuItem;
}

function createQualityPanel(qualityLabels: Array<{ label: string; isPremium?: boolean }>) {
    const qualityPanel = document.createElement("div");
    qualityPanel.className = "ytp-panel ytp-quality-menu";

    const panelMenu = document.createElement("div");
    panelMenu.className = "ytp-panel-menu";

    for (const entry of qualityLabels) {
        panelMenu.append(createMenuItem(entry));
    }

    qualityPanel.append(panelMenu);
    return qualityPanel;
}

async function waitForCondition(predicate: () => boolean, maxAttempts = 100): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(predicate()).toBe(true);
}

const sampleVod: YoutubeData = {
    platform: "youtube",
    type: "vod",
    title: "VOD Test",
    durationSeconds: 3600,
    thumbnailUrl: undefined,
    channelName: "Tester",
    channelUrl: undefined,
    formats: [
        {
            type: "vod",
            formatId: 137,
            height: 1080,
            sizeBytes: 500_000_000,
            sizePerSecondBytes: 500_000_000 / 3600,
        },
        {
            type: "vod",
            formatId: 136,
            height: 720,
            sizeBytes: 250_000_000,
            sizePerSecondBytes: 250_000_000 / 3600,
        },
    ],
};

const sampleLive: YoutubeData = {
    platform: "youtube",
    type: "live",
    title: "Live Test",
    channelName: "LiveChannel",
    thumbnailUrl: undefined,
    channelUrl: undefined,
    formats: [
        {
            type: "live",
            resolution: 1080,
            sizePerSecondBytes: 500_000,
        },
    ],
};

describe("qualityMenuInjector", () => {
    test("injects VOD format sizes while skipping Premium and Auto labels", async () => {
        const settingsMenu = createSettingsMenu([
            { label: "1080p", isPremium: true },
            { label: "1080p" },
            { label: "720p" },
            { label: "Auto" },
        ]);

        await injectMenu(youtubeAdapter, sampleVod);

        const badges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")].map(
            (node) => node.textContent,
        );
        expect(badges).toEqual(["500 MB", "250 MB"]);

        const labels = [...settingsMenu.querySelectorAll(".ytp-menuitem-label > div")];
        expect(labels[0]?.querySelector(".tubesize-quality-menu-panel")).toBeNull();
        expect(labels[1]?.querySelector(".tubesize-quality-menu-panel")?.textContent).toBe(
            "500 MB",
        );
        expect(labels[2]?.querySelector(".tubesize-quality-menu-panel")?.textContent).toBe(
            "250 MB",
        );
        expect(labels[3]?.querySelector(".tubesize-quality-menu-panel")).toBeNull();
    });

    test("observes dynamic quality menu mounts and renders live hourly rates", async () => {
        const settingsMenu = createSettingsMenu();

        await injectMenu(youtubeAdapter, sampleLive);
        expect(settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);

        settingsMenu.append(createQualityPanel([{ label: "1080p" }]));
        await waitForCondition(
            () => settingsMenu.querySelectorAll(".tubesize-quality-menu-panel").length === 1,
        );

        const badges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")].map(
            (node) => node.textContent,
        );
        expect(badges).toEqual(["1.8 GB/hour"]);
    });

    test("reuses existing badges in place without duplication across observer mutations and clears on clearQualityMenu", async () => {
        const settingsMenu = createSettingsMenu([{ label: "1080p" }]);

        await injectMenu(youtubeAdapter, sampleVod);
        const initialBadges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")];
        expect(initialBadges).toHaveLength(1);
        const firstBadge = initialBadges[0];
        if (!firstBadge) throw new Error("Expected initial badge element");
        expect(firstBadge.textContent).toBe("500 MB");

        // Trigger a childList mutation on .ytp-panel-menu with stale badge text to verify
        // the active MutationObserver updates the existing badge DOM node in place.
        firstBadge.textContent = "stale";
        const panelMenu = settingsMenu.querySelector(".ytp-panel-menu");
        if (!panelMenu) throw new Error("Expected .ytp-panel-menu element");
        panelMenu.append(createMenuItem({ label: "720p" }));

        await waitForCondition(
            () =>
                settingsMenu.querySelectorAll(".tubesize-quality-menu-panel").length === 2 &&
                firstBadge.textContent === "500 MB",
        );
        await new Promise((resolve) => setTimeout(resolve, 10));

        const reusedBadges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")];
        expect(reusedBadges).toHaveLength(2);
        expect(reusedBadges[0]).toBe(firstBadge);
        expect(reusedBadges.map((node) => node.textContent)).toEqual(["500 MB", "250 MB"]);

        await injectMenu(youtubeAdapter, {
            ...sampleVod,
            formats: [
                {
                    type: "vod",
                    formatId: 137,
                    height: 1080,
                    sizeBytes: 900_000_000,
                    sizePerSecondBytes: 250_000,
                },
            ],
        });
        await new Promise((resolve) => setTimeout(resolve, 10));

        const updatedBadges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")];
        expect(updatedBadges).toHaveLength(1);
        expect(updatedBadges[0]?.textContent).toBe("900 MB");

        clearQualityMenu();
        expect(settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);
    });
});
