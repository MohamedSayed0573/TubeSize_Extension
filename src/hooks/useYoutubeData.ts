import { extractVideoTag, isShortsVideo } from "@/lib/utils";
import { sendMessageToBackground } from "@/runtime";
import type { YoutubeData } from "@/types/types";
import { useEffect, useState } from "react";

export function useYoutubeData(tabUrl: string, tabId: number) {
    const [message, setMessage] = useState<string>();
    const [error, setError] = useState<Error>();
    const [data, setData] = useState<YoutubeData>();
    const [createdAt, setCreatedAt] = useState<string | undefined>();
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!tabUrl || !tabId) return;
        const getYoutubeData = async () => {
            try {
                const videoTag = extractVideoTag(tabUrl);
                if (!videoTag) {
                    setMessage("Open a Youtube video");
                    return;
                }

                const response = await sendMessageToBackground({
                    type: "youtubeVideo",
                    videoTag,
                    tabId,
                });

                if (!response.success) {
                    throw new Error(response.message);
                }

                if (response.data.formats.length === 0) {
                    throw new Error("No video formats found for this video");
                }

                if (response.data.type === "video" && isShortsVideo(tabUrl)) {
                    response.data.isShorts = true;
                }

                setData(response.data);
                setCreatedAt(response.createdAt);
            } catch (err) {
                setError(err instanceof Error ? err : new Error(String(err)));
            } finally {
                setIsLoading(false);
            }
        };

        void getYoutubeData();
    }, [tabId, tabUrl]);

    return { message, data, createdAt, error, isLoading };
}
