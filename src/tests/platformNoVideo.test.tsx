import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import { AppProviders } from "@layouts/appProviders";
import { PlatformView } from "@pages/popup/platforms/platformView";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { clearDatabaseData } from "@/db";
import { setLanguage } from "@/i18n/language";

import { installDomEnv } from "./domEnv";

describe("popup PlatformView no-video empty state", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;
    let queryClient: QueryClient | undefined;
    let host: HTMLDivElement | undefined;
    const cleanups: Array<() => void> = [];

    beforeEach(async () => {
        cleanupDom = installDomEnv();
        await setLanguage("en");
        await clearDatabaseData();
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { gcTime: 0 },
                mutations: { gcTime: 0 },
            },
        });
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);

        const tabsSpy = spyOn(globalThis.chrome.tabs, "query").mockImplementation((async () => [
            { id: 1, url: "https://www.youtube.com/", active: true },
        ]) as unknown as typeof chrome.tabs.query);
        cleanups.push(() => tabsSpy.mockRestore());
    });

    afterEach(async () => {
        while (cleanups.length > 0) cleanups.pop()?.();
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
        await setLanguage("en");
        await clearDatabaseData();
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    async function render(node: ReactNode) {
        await act(async () => {
            root?.render(
                <AppProviders>
                    <QueryClientProvider client={queryClient!}>
                        <MemoryRouter>{node}</MemoryRouter>
                    </QueryClientProvider>
                </AppProviders>,
            );
        });
    }

    test("renders borderless centered empty state in English", async () => {
        await render(<PlatformView tabUrl="https://www.youtube.com/" />);

        const stateEl = host?.querySelector("[data-popup-state='no-video']");
        expect(stateEl).not.toBeNull();
        expect(stateEl?.textContent).toContain("No video playing");
        expect(stateEl?.textContent).toContain(
            "Open a video or stream to see estimated data usage.",
        );
    });

    test("renders localized Arabic copy in RTL", async () => {
        await setLanguage("ar");
        await render(<PlatformView tabUrl="https://www.youtube.com/" />);

        const stateEl = host?.querySelector("[data-popup-state='no-video']");
        expect(stateEl).not.toBeNull();
        expect(document.documentElement.dir).toBe("rtl");
        expect(stateEl?.textContent).toContain("لا يوجد فيديو قيد التشغيل");
        expect(stateEl?.textContent).toContain("افتح فيديو أو بثًا لرؤية تقدير استهلاك البيانات.");
    });
});
