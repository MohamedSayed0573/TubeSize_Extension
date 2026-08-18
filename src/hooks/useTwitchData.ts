import { extractChannelName, extractTwitchVodId, isTwitchVod } from "@/lib/utils";
import { sendMessageToBackground } from "@/runtime";
import type { TwitchData } from "@/types/types";
import { useEffect, useState } from "react";

export function useTwitchData(tabUrl: string) {
    const [data, setData] = useState<TwitchData>();
    const [error, setError] = useState<Error>();
    const [message, setMessage] = useState<string>();
    const [isLoading, setIsLoading] = useState(true);
    const [createdAt, setCreatedAt] = useState<string | undefined>();

    useEffect(() => {
        const getTwitchData = async () => {
            try {
                if (isTwitchVod(tabUrl)) {
                    const vodId = extractTwitchVodId(tabUrl);
                    if (!vodId) {
                        setMessage("Open a Twitch stream or VOD");
                        return;
                    }

                    const response = await sendMessageToBackground({
                        type: "twitchVod",
                        vodId: vodId,
                    });
                    if (!response.success) throw new Error(response.message);

                    setData(response.data);
                    setCreatedAt(response.createdAt);
                } else {
                    const channelName = extractChannelName(tabUrl);
                    if (!channelName) {
                        setMessage("Open a Twitch stream");
                        return;
                    }

                    const response = await sendMessageToBackground({
                        type: "twitchLive",
                        channelName: channelName,
                        isFromPopup: true,
                    });
                    if (!response.success) throw new Error(response.message);
                    setData(response.data);
                }
            } catch (err) {
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsLoading(false);
            }
        };

        void getTwitchData();
    }, [tabUrl]);

    return { data, error, message, isLoading, createdAt };
}
