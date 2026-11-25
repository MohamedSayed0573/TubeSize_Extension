import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import type { MediaEstimate } from "@app-types/platforms.types";
import useSettings from "@hooks/useSettings";
import { getSettings, saveSettings } from "@lib/settings";
import FormatView from "@pages/popup/platforms/formatView";
import AdvancedViewSettings from "@pages/settings/advancedViewSettings";
import ToasterSettings from "@pages/settings/toasterSettings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeBrowser } from "@webext-core/fake-browser";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installDomEnv } from "./domEnv";

function ToasterSettingsHarness() {
    const { query } = useSettings();
    if (!query.data) return null;
    return <ToasterSettings settingsState={query.data} />;
}

function AdvancedViewSettingsHarness() {
    const { query } = useSettings();
    if (!query.data) return null;
    return <AdvancedViewSettings settingsState={query.data} />;
}

const vodEstimateWithAudio: MediaEstimate = {
    platform: "youtube",
    contentType: "vod",
    title: "Test Video",
    durationSeconds: 600,
    formats: [
        {
            kind: "vod",
            resolution: 1080,
            formatId: 399,
            codec: "av01",
            fps: 30,
            sizeBytes: 60_000_000,
            sizePerSecondBytes: 100_000,
        },
    ],
    audio: {
        formatId: 251,
        codec: "opus",
        sizeBytes: 40_000_000,
        bytesPerSecond: 66_667,
        itags: [{ formatId: 251, codec: "opus", sizeBytes: 40_000_000 }],
    },
};

async function waitForCondition(check: () => boolean | Promise<boolean>, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (await check()) return;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
    expect(await check()).toBe(true);
}

describe("settings and popup switches", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;
    let queryClient: QueryClient | undefined;
    let host: HTMLDivElement | undefined;
    const spies: Array<{ mockRestore: () => void }> = [];

    beforeEach(() => {
        cleanupDom = installDomEnv();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, gcTime: 0 },
                mutations: { retry: false, gcTime: 0 },
            },
        });
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    });

    afterEach(async () => {
        for (const spy of spies.splice(0)) {
            spy.mockRestore();
        }
        if (root) {
            const activeRoot = root;
            root = undefined;
            await act(async () => {
                activeRoot.unmount();
            });
        }
        queryClient?.clear();
        queryClient = undefined;
        await new Promise((resolve) => setTimeout(resolve, 0));
        host = undefined;
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    async function render(node: ReactNode) {
        await act(async () => {
            root?.render(<QueryClientProvider client={queryClient!}>{node}</QueryClientProvider>);
        });
    }

    test("clicking toasterThresholdToggle label toggles, disables while pending, and persists toasterEnabled", async () => {
        await render(<ToasterSettingsHarness />);
        await waitForCondition(
            () => host?.querySelector('label[for="toasterThresholdToggle"]') !== null,
        );

        const label = host?.querySelector<HTMLLabelElement>('label[for="toasterThresholdToggle"]');
        const switchEl = host?.querySelector<HTMLElement>('[role="switch"]');
        expect(label).not.toBeNull();
        expect(switchEl?.getAttribute("aria-checked")).toBe("true");

        const realSet = fakeBrowser.storage.sync.set.bind(fakeBrowser.storage.sync);
        let releaseWrite: (() => void) | undefined;
        const writeGate = new Promise<void>((resolve) => {
            releaseWrite = resolve;
        });
        spies.push(
            spyOn(fakeBrowser.storage.sync, "set").mockImplementation((items) =>
                writeGate.then(() => realSet(items)),
            ),
        );

        await act(async () => {
            label?.click();
        });

        await waitForCondition(() => switchEl?.getAttribute("aria-disabled") === "true");

        releaseWrite?.();
        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                !(await getSettings()).toasterEnabled &&
                switchEl?.getAttribute("aria-checked") === "false" &&
                switchEl?.getAttribute("aria-disabled") !== "true",
        );

        await act(async () => {
            label?.click();
        });

        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                (await getSettings()).toasterEnabled &&
                switchEl?.getAttribute("aria-checked") === "true",
        );
    });

    test("clicking advancedViewToggle label toggles and persists advancedView", async () => {
        await render(<AdvancedViewSettingsHarness />);
        await waitForCondition(
            () => host?.querySelector('label[for="advancedViewToggle"]') !== null,
        );

        const label = host?.querySelector<HTMLLabelElement>('label[for="advancedViewToggle"]');
        const switchEl = host?.querySelector<HTMLElement>('[role="switch"]');
        expect(label).not.toBeNull();
        expect(switchEl?.getAttribute("aria-checked")).toBe("false");

        await act(async () => {
            label?.click();
        });

        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                (await getSettings()).advancedView &&
                switchEl?.getAttribute("aria-checked") === "true",
        );

        await act(async () => {
            label?.click();
        });

        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                !(await getSettings()).advancedView &&
                switchEl?.getAttribute("aria-checked") === "false",
        );
    });

    test("clicking includeAudioToggle label toggles, persists includeAudio, and updates displayed sizes", async () => {
        await saveSettings({ advancedView: true, includeAudio: true });

        await render(<FormatView estimate={vodEstimateWithAudio} />);
        await waitForCondition(
            () => host?.querySelector('label[for="includeAudioToggle"]') !== null,
        );

        const label = host?.querySelector<HTMLLabelElement>('label[for="includeAudioToggle"]');
        const switchEl = host?.querySelector<HTMLElement>('[role="switch"]');
        expect(label).not.toBeNull();
        expect(switchEl?.getAttribute("aria-checked")).toBe("true");
        expect(host?.textContent).toContain("100 MB");

        await act(async () => {
            label?.click();
        });

        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                !(await getSettings()).includeAudio &&
                switchEl?.getAttribute("aria-checked") === "false",
        );
        expect(host?.textContent).toContain("60 MB");

        await act(async () => {
            label?.click();
        });

        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                (await getSettings()).includeAudio &&
                switchEl?.getAttribute("aria-checked") === "true",
        );
        expect(host?.textContent).toContain("100 MB");
    });
});
