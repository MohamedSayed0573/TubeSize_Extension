import type { TwitchData } from "@app-types/platforms.types";
import { extractChannelName, extractTwitchVodId, isTwitchLive, isTwitchPage } from "@lib/utils";
import { startToastTracking } from "@pages/toasterTracking";

import { twitchAdapter } from "@/adapters/twitchAdapter";
import { sendMessage } from "@/messaging";

import type { PlatformPage } from "./platformPage";

async function initTwitch(url: string): Promise<TwitchData | undefined> {
    const isLive = isTwitchLive(url);
    const tag = isLive ? extractChannelName(url) : extractTwitchVodId(url);
    if (!tag) return undefined;

    const twitchData = isLive
        ? await sendMessage("twitchLive", {
              channelName: tag,
              isFromPopup: false,
          })
        : await sendMessage("twitchVod", {
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
    startToaster: (data) => startToastTracking(twitchAdapter, data),
};
