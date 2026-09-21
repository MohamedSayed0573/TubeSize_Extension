import type { KickData } from "@app-types/platforms.types";
import type { PlatformPage } from "./platformPage";
import { extractChannelName, extractKickVodId, isKickPage, isKickStream } from "@lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { startToastKickPolling } from "@pages/toasterTracking";

// Unlike Twitch, Kick VODs are resolved through the channel's video list, so
// the channel name is required alongside the VOD id.
async function initKick(url: string): Promise<KickData | undefined> {
    const isLive = isKickStream(url);
    const channelName = extractChannelName(url);
    const tag = isLive ? channelName : extractKickVodId(url);
    if (!tag || !channelName) return undefined;

    const kickData = isLive
        ? await sendMessageToBackground({
              type: "kickLive",
              channelName: tag,
              isFromPopup: false,
          })
        : await sendMessageToBackground({
              type: "kickVod",
              vodId: tag,
              channelName: channelName,
          });
    if (!kickData.success) {
        throw new Error("No response from background for Kick stream");
    }
    return kickData.data;
}

export const kickPage: PlatformPage<KickData> = {
    matches: isKickPage,
    init: initKick,
    startToaster: startToastKickPolling,
};
