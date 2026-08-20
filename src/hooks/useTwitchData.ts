import { extractChannelName, extractTwitchVodId, isTwitchPage, isTwitchVod } from "@/lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export function useTwitchData(tabUrl: string) {
    const isTwitchRelated = isTwitchPage(tabUrl);
    const query = useQuery({
        queryKey: ["twitch", tabUrl],
        queryFn: async () => {
            if (isTwitchVod(tabUrl)) {
                const vodId = extractTwitchVodId(tabUrl);
                if (!vodId) {
                    throw new Error("Open a Twitch stream or VOD");
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
            const channelName = extractChannelName(tabUrl);
            if (!channelName) {
                throw new Error("Open a Twitch stream");
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
