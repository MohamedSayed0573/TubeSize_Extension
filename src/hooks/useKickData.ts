import {
    extractChannelName,
    extractKickVodId,
    isKickPage,
    isKickStream,
    isKickVod,
} from "@lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export function useKickData(tabUrl: string, tabId: number) {
    const isKickRelated = isKickPage(tabUrl) && (isKickStream(tabUrl) || isKickVod(tabUrl));
    const query = useQuery({
        queryKey: ["kick", tabUrl, tabId],
        queryFn: async () => {
            // The page is a Kick Video (Not a live stream)
            if (isKickVod(tabUrl)) {
                const vodId = extractKickVodId(tabUrl);
                const channelName = extractChannelName(tabUrl);
                if (!vodId || !channelName) {
                    throw new Error("Open a Kick stream or video");
                }

                const response = await sendMessageToBackground({
                    type: "kickVod",
                    vodId: vodId,
                    channelName: channelName,
                });
                if (!response.success) throw new Error(response.message);

                return {
                    data: response.data,
                    createdAt: response.createdAt,
                };
            }
            // The page is a Kick Live Stream
            const channelName = extractChannelName(tabUrl);
            if (!channelName) {
                throw new Error("Open a Kick stream or video");
            }

            const response = await sendMessageToBackground({
                type: "kickLive",
                channelName: channelName,
                isFromPopup: true,
            });
            if (!response.success) throw new Error(response.message);

            return {
                data: response.data,
                createdAt: undefined,
            };
        },
        enabled: isKickRelated,
    });

    return {
        query,
        isKickRelated,
    };
}
