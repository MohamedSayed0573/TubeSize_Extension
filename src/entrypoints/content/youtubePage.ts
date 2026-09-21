import type { YoutubeData } from "@app-types/platforms.types";
import type { PlatformPage } from "./platformPage";
import { extractVideoTag, isYoutubePage } from "@lib/utils";
import { injectQualityMenu } from "@/qualityMenuInjector";
import { sendMessageToBackground } from "@/runtime";
import { startYoutubeToastTracking } from "@pages/toasterTracking";

async function initYoutube(url: string): Promise<YoutubeData | undefined> {
    const videoTag = extractVideoTag(url);
    if (!videoTag) return undefined;

    const scriptsArray = [...document.scripts];
    const ytInitialPlayerResponse = scriptsArray.find((script) => {
        return script.textContent.includes("ytInitialPlayerResponse");
    });

    const scriptContent = ytInitialPlayerResponse?.textContent;

    const youtubeResponse = await sendMessageToBackground({
        type: "youtubeVideo",
        videoTag: videoTag,
        html: scriptContent,
    });

    if (!youtubeResponse.success) {
        throw new Error("No response from background for YouTube video");
    }
    return youtubeResponse.data;
}

export const youtubePage: PlatformPage<YoutubeData> = {
    matches: isYoutubePage,
    init: initYoutube,
    afterInit: async (data) => await injectQualityMenu(data),
    startToaster: startYoutubeToastTracking,
};
