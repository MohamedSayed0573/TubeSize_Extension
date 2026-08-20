import { extractVideoTag, isShortsVideo, isYoutubePage } from "@/lib/utils";
import { sendMessageToBackground } from "@/runtime";
import { useQuery } from "@tanstack/react-query";

export function useYoutubeData(tabUrl: string, tabId: number) {
    const isYoutubeVideo = isYoutubePage(tabUrl) && !!extractVideoTag(tabUrl);
    const query = useQuery({
        queryKey: [tabUrl, tabId],
        queryFn: async () => {
            const videoTag = extractVideoTag(tabUrl)!;

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

            return {
                data: response.data,
                createdAt: response.createdAt,
            };
        },
        enabled: isYoutubeVideo,
    });

    return {
        query,
        isYoutubeVideo,
    };
}
