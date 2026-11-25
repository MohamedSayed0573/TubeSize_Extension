import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import type { DisplayFormat } from "@app-types/platforms.types";

import { clearQualityMenu, injectQualityMenu } from "@/entrypoints/content/qualityMenuInjector";

import { installDomEnv } from "./domEnv";

let cleanupDom: (() => Promise<void>) | undefined;
const controllers: AbortController[] = [];

function createSignal(): AbortController {
    const controller = new AbortController();
    controllers.push(controller);
    return controller;
}

beforeEach(() => {
    cleanupDom = installDomEnv();
});

afterEach(async () => {
    while (controllers.length > 0) controllers.pop()?.abort();
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

const sampleVodFormats: DisplayFormat[] = [
    {
        kind: "vod",
        key: 137,
        resolution: 1080,
        sizeBytes: 500_000_000,
        sizePerSecondBytes: 500_000_000 / 3600,
    },
    {
        kind: "vod",
        key: 136,
        resolution: 720,
        sizeBytes: 250_000_000,
        sizePerSecondBytes: 250_000_000 / 3600,
    },
];

const sampleLiveFormats: DisplayFormat[] = [
    {
        kind: "live",
        key: 1080,
        resolution: 1080,
        sizePerSecondBytes: 500_000,
    },
];

describe("qualityMenuInjector", () => {
    test("injects VOD format sizes while skipping Premium and Auto labels", async () => {
        const settingsMenu = createSettingsMenu([
            { label: "1080p", isPremium: true },
            { label: "1080p" },
            { label: "720p" },
            { label: "Auto" },
        ]);

        await injectQualityMenu(sampleVodFormats, createSignal().signal);

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

        await injectQualityMenu(sampleLiveFormats, createSignal().signal);
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

    test("reuses existing badges in place across observer mutations and clears on abort", async () => {
        const settingsMenu = createSettingsMenu([{ label: "1080p" }]);

        const firstController = createSignal();
        await injectQualityMenu(sampleVodFormats, firstController.signal);
        const initialBadges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")];
        expect(initialBadges).toHaveLength(1);
        const firstBadge = initialBadges[0];
        if (!firstBadge) throw new Error("Expected initial badge element");
        expect(firstBadge.textContent).toBe("500 MB");

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

        firstController.abort();
        expect(settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);

        const secondController = createSignal();
        await injectQualityMenu(
            [
                {
                    kind: "vod",
                    key: 137,
                    resolution: 1080,
                    sizeBytes: 900_000_000,
                    sizePerSecondBytes: 250_000,
                },
            ],
            secondController.signal,
        );
        await new Promise((resolve) => setTimeout(resolve, 10));

        const updatedBadges = [...settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")];
        expect(updatedBadges).toHaveLength(1);
        expect(updatedBadges[0]?.textContent).toBe("900 MB");

        secondController.abort();
        expect(settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);
    });

    test("aborts an in-flight wait for .ytp-settings-menu without injecting badges later", async () => {
        const controller = createSignal();
        const pending = injectQualityMenu(sampleVodFormats, controller.signal);

        controller.abort();
        await pending;

        const settingsMenu = createSettingsMenu([{ label: "1080p" }]);
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(settingsMenu.querySelectorAll(".tubesize-quality-menu-panel")).toHaveLength(0);
    });
});
