import type { DisplayFormat } from "@app-types/platforms.types";
import type { PlatformId } from "@app-types/types";
import type { EstimateMediaOptions } from "@lib/mediaEstimate";

import { clearQualityMenu, injectQualityMenu } from "./qualityMenuInjector";

export type ContentPlatformHooks = {
    getLoadOptions?: (context: { isInitialLoad: boolean }) => Pick<EstimateMediaOptions, "html">;
    onFormatsLoaded?: (formats: readonly DisplayFormat[], signal: AbortSignal) => void;
    onDispose?: () => void;
};

const YT_INITIAL_PLAYER_ASSIGNMENT_REGEX = /\bytInitialPlayerResponse\s*=\s*\{/;

/**
 * YouTube only writes `ytInitialPlayerResponse` on a full page load. After an
 * SPA navigation it still describes the previous video, so it can only be
 * trusted on the initial navigation (`isInitialLoad === true`).
 */
function scrapeYoutubeInitialHtml(isInitialLoad: boolean): string | undefined {
    if (!isInitialLoad) return undefined;
    return [...document.scripts].find((script) =>
        YT_INITIAL_PLAYER_ASSIGNMENT_REGEX.test(script.textContent),
    )?.textContent;
}

export const CONTENT_PLATFORM_HOOKS: Partial<Record<PlatformId, ContentPlatformHooks>> = {
    youtube: {
        getLoadOptions: ({ isInitialLoad }) => ({
            html: scrapeYoutubeInitialHtml(isInitialLoad),
        }),
        onFormatsLoaded: (formats, signal) => {
            void injectQualityMenu(formats, signal);
        },
        onDispose: clearQualityMenu,
    },
};
