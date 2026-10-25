import type { YoutubeData } from "@app-types/platforms.types";
import { extractVideoTag, isYoutubePage } from "@lib/utils";
import { startToastTracking } from "@pages/toasterTracking";

import { youtubeAdapter } from "@/adapters/youtubeAdapter";
import { getAv1Support } from "@/lib/codecSupport";
import { sendMessage } from "@/messaging";
import { injectMenu } from "@/qualityMenuInjector";

import type { PlatformPage } from "./platformPage";

async function initYoutube(url: string): Promise<YoutubeData | undefined> {
    const videoTag = extractVideoTag(url);
    if (!videoTag) return undefined;

    const scriptsArray = [...document.scripts];
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    let av1Supported: boolean | undefined;
    try {
        av1Supported = await getAv1Support();
    } catch (err) {
        console.error("[content] Failed to detect AV1 support", err);
    }

    const youtubeResponse = await sendMessage("youtubeVideo", {
        videoTag: videoTag,
        html: scriptContent,
        av1Supported,
    });

    if (!youtubeResponse.success) {
        throw new Error("No response from background for YouTube video");
    }
    return youtubeResponse.data;
}

export const youtubePage: PlatformPage<YoutubeData> = {
    matches: isYoutubePage,
    init: initYoutube,
    afterInit: (data) => void injectMenu(youtubeAdapter, data),
    startToaster: (data) => startToastTracking(youtubeAdapter, data),
};
