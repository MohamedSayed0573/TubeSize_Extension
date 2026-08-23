import {
    extractChannelName,
    extractTwitchVodId,
    isTwitchLive,
    isTwitchPage,
    isTwitchVod,
} from "@lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export function useTwitchData(tabUrl: string) {
    const isTwitchRelated = isTwitchPage(tabUrl) && (isTwitchLive(tabUrl) || isTwitchVod(tabUrl));
    const query = useQuery({
        queryKey: ["twitch", tabUrl],
        queryFn: async () => {
            // The page is a Twitch Video (Not a live stream)
            if (isTwitchVod(tabUrl)) {
                const vodId = extractTwitchVodId(tabUrl);
                if (!vodId) {
                    throw new Error("Open a Twitch stream or video");
                }

                const response = await sendMessageToBackground({
                    type: "twitchVod",
                    vodId: vodId,
                });
                if (!response.success) throw new Error(response.message);

                return {
                    data: response.data,
                    createdAt: response.createdAt,
                };
            }
            // The page is a Twitch Live Stream
            const channelName = extractChannelName(tabUrl);
            if (!channelName) {
                throw new Error("Open a Twitch stream or video");
            }

            const response = await sendMessageToBackground({
                type: "twitchLive",
                channelName: channelName,
                isFromPopup: true,
            });
            if (!response.success) throw new Error(response.message);

            return {
                data: response.data,
                createdAt: undefined,
            };
        },
        enabled: isTwitchRelated,
    });

    return {
        query,
        isTwitchRelated,
    };
}
