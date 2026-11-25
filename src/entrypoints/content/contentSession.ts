import { parsePlatformUrl } from "@lib/platformUrl";
import { getSettings } from "@lib/settings";

import { loadPlatformFormats } from "@/adapters/registry";

import { CONTENT_PLATFORM_HOOKS, type ContentPlatformHooks } from "./platformHooks";
import { trackResolutionChanges } from "./resolution";
import { createToaster, unmountToast } from "./toaster";

export type ContentSession = {
    navigate: (url?: string) => Promise<void>;
    dispose: () => void;
};

export function isSamePageNavigation(previous: URL, next: URL): boolean {
    return (
        previous.origin === next.origin &&
        previous.pathname === next.pathname &&
        previous.search === next.search
    );
}

export function createContentSession(): ContentSession {
    let activeController: AbortController | undefined;
    let activeHooks: ContentPlatformHooks | undefined;
    let hasNavigated = false;

    const dispose = () => {
        activeController?.abort();
        activeController = undefined;
        activeHooks?.onDispose?.();
        activeHooks = undefined;
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
            const parsed = parsePlatformUrl(url);
            if (parsed?.kind !== "media") return;

            const hooks = CONTENT_PLATFORM_HOOKS[parsed.platform];
            activeHooks = hooks;

            const formats = await loadPlatformFormats(parsed.platform, url, {
                isFromPopup: false,
                ...hooks?.getLoadOptions?.({ isInitialLoad }),
            });

            if (signal.aborted) return;

            hooks?.onFormatsLoaded?.(formats, signal);

            const { toasterEnabled, toasterThreshold } = await getSettings();
            if (!toasterEnabled || signal.aborted) return;

            const toaster = createToaster(signal);
            await trackResolutionChanges((resolution) => {
                if (signal.aborted) return;
                void toaster.show({
                    formats,
                    currentQuality: resolution,
                    thresholdMbph: toasterThreshold,
                });
            }, signal);
        } catch (err) {
            if (signal.aborted) return;
            console.error("[content] Error handling page navigation", err);
        }
    };

    return { navigate, dispose };
}
