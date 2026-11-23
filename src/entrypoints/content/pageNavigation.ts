import type { PlatformId } from "@app-types/types";
import { toasterEnabled } from "@lib/storage";

import { findPlatformAdapter } from "@/adapters/registry";
import type { PlatformAdapter, PlatformDataMap } from "@/adapters/types";

import { clearQualityMenu, injectMenu } from "./qualityMenuInjector";
import { stopResolutionTracking } from "./resolution";
import { unmountToast } from "./toaster";
import { startToastTracking } from "./toasterTracking";

let latestNavigationId = 0;

/**
 * YouTube only writes `ytInitialPlayerResponse` on a full page load. After an
 * SPA navigation it still describes the previous video, so it can only be
 * trusted on the initial navigation (`isInitialLoad === true`).
 */
function scrapeYoutubeInitialHtml(isInitialLoad: boolean): string | undefined {
    if (!isInitialLoad) return undefined;
    return [...document.scripts].find((script) =>
        script.textContent.includes("ytInitialPlayerResponse"),
    )?.textContent;
}

async function runPlatformPage<P extends PlatformId>(
    adapter: PlatformAdapter<P>,
    url: string,
    navigationId: number,
    options?: {
        getHtml?: () => string | undefined;
        afterLoad?: (data: PlatformDataMap[P]) => void;
    },
) {
    if (!adapter.isRunningVideo(url)) return;

    const data = await adapter.load(url, undefined, {
        isFromPopup: false,
        html: options?.getHtml?.(),
    });
    if (navigationId !== latestNavigationId) return;

    options?.afterLoad?.(data);

    if (await toasterEnabled.getValue()) {
        // Storage access can be slow, so make sure a newer navigation
        // hasn't started while we waited.
        if (navigationId !== latestNavigationId) return;
        await startToastTracking(adapter, data);
    }
}

export async function handlePageNavigation() {
    const navigationId = ++latestNavigationId;

    try {
        resetFeatureState();

        const url = location.href;
        const adapter = findPlatformAdapter(url);
        if (!adapter) return;

        switch (adapter.platform) {
            case "youtube": {
                await runPlatformPage(adapter, url, navigationId, {
                    getHtml: () => scrapeYoutubeInitialHtml(navigationId === 1),
                    afterLoad: (data) => void injectMenu(adapter, data),
                });
                return;
            }
            case "twitch": {
                await runPlatformPage(adapter, url, navigationId);
                return;
            }
            case "kick": {
                await runPlatformPage(adapter, url, navigationId);
                return;
            }
            default: {
                const exhaustive: never = adapter;
                return exhaustive;
            }
        }
    } catch (err) {
        console.error("[content] Error handling page navigation", err);
    }
}

function resetFeatureState() {
    stopResolutionTracking();
    clearQualityMenu();
    unmountToast();
}
