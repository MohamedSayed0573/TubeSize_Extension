import type { PlatformId } from "@app-types/types";
import { toasterEnabled, toasterThreshold } from "@lib/storage";

import { findPlatformAdapter } from "@/adapters/registry";
import type { DisplayFormat, PlatformAdapter } from "@/adapters/types";

import { clearQualityMenu, injectQualityMenu } from "./qualityMenuInjector";
import { trackResolutionChanges } from "./resolution";
import { createToaster, unmountToast } from "./toaster";

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

async function loadPageFormats<P extends PlatformId>(
    adapter: PlatformAdapter<P>,
    url: string,
    html?: string,
): Promise<DisplayFormat[]> {
    const data = await adapter.load(url, undefined, {
        isFromPopup: false,
        html,
    });
    return adapter.formats(data);
}

export type ContentSession = {
    navigate: (url?: string) => Promise<void>;
    dispose: () => void;
};

export function createContentSession(): ContentSession {
    let activeController: AbortController | undefined;
    let hasNavigated = false;

    const dispose = () => {
        activeController?.abort();
        activeController = undefined;
        clearQualityMenu();
        unmountToast();
    };

    const navigate = async (url = location.href) => {
        dispose();

        const controller = new AbortController();
        activeController = controller;
        const { signal } = controller;

        const isInitialLoad = !hasNavigated;
        hasNavigated = true;

        try {
            const adapter = findPlatformAdapter(url);
            if (!adapter || !adapter.isRunningVideo(url)) return;

            let formats: DisplayFormat[];
            switch (adapter.platform) {
                case "youtube": {
                    formats = await loadPageFormats(
                        adapter,
                        url,
                        scrapeYoutubeInitialHtml(isInitialLoad),
                    );
                    break;
                }
                case "twitch": {
                    formats = await loadPageFormats(adapter, url);
                    break;
                }
                case "kick": {
                    formats = await loadPageFormats(adapter, url);
                    break;
                }
                default: {
                    const exhaustive: never = adapter;
                    return exhaustive;
                }
            }

            if (signal.aborted) return;

            if (adapter.platform === "youtube") {
                void injectQualityMenu(formats, signal);
            }

            if (!(await toasterEnabled.getValue()) || signal.aborted) return;

            const thresholdMbph = await toasterThreshold.getValue();
            if (signal.aborted) return;

            const toaster = createToaster(signal);
            await trackResolutionChanges((resolution) => {
                if (signal.aborted) return;
                void toaster.show({ formats, currentQuality: resolution, thresholdMbph });
            }, signal);
        } catch (err) {
            if (signal.aborted) return;
            console.error("[content] Error handling page navigation", err);
        }
    };

    return { navigate, dispose };
}
