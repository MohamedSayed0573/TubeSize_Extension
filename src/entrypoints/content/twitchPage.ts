import type { TwitchData } from "@app-types/platforms.types";
import type { PlatformPage } from "./platformPage";
import { extractChannelName, extractTwitchVodId, isTwitchLive, isTwitchPage } from "@lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { startToastTwitchPolling } from "@pages/toasterTracking";

async function initTwitch(url: string): Promise<TwitchData | undefined> {
    const isLive = isTwitchLive(url);
    const tag = isLive ? extractChannelName(url) : extractTwitchVodId(url);
    if (!tag) return undefined;

    const twitchData = isLive
        ? await sendMessageToBackground({
              type: "twitchLive",
              channelName: tag,
              isFromPopup: false,
          })
        : await sendMessageToBackground({
              type: "twitchVod",
              vodId: tag,
          });
    if (!twitchData.success) {
        throw new Error("No response from background for Twitch stream");
    }
    return twitchData.data;
}

export const twitchPage: PlatformPage<TwitchData> = {
    matches: isTwitchPage,
    init: initTwitch,
    startToaster: startToastTwitchPolling,
};
