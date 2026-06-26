import { sendMessageToBackground, sendMessageToContentScript } from "@/runtime";
import { useEffect, useState } from "react";
import {
    extractVideoTag,
    isYoutubePage,
    isShortsVideo,
    isTwitchPage,
    extractChannelName,
    isTwitchVod,
    isKickPage,
    extractTwitchVodId,
    isKickStream,
    isKickVod,
} from "@lib/utils";
import Header from "@components/header";
import useTab from "@hooks/useTab";
import YoutubeFormats from "@components/youtubeFormats";
import TwitchFormats from "@components/twitchFormats";
import KickFormats from "@components/kickFormats";
import type { PopupData } from "@app-types/uiTypes";
import PopupUsage from "@/components/popupUsage";
import InfoCard from "@/components/infoCard";
import Spinner from "@/components/spinner";

export default function Popup() {
    const [message, setMessage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const { tabId, tabUrl, error: tabError } = useTab();
    const [data, setData] = useState<PopupData | undefined>();
    const [error, setError] = useState<Error | undefined>();

    useEffect(() => {
        void (async () => {
            if (!tabUrl) return;

            if (isYoutubePage(tabUrl)) {
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
                if (!response.success) throw new Error(response.message);
                if (response.data.formats.length === 0) {
                    throw new Error("No video formats found for this video");
                }
                if (response.data.type === "video" && isShortsVideo(tabUrl)) {
                    response.data.isShorts = true;
                }
                setData({
                    platform: "youtube",
                    data: response.data,
                    cacheCreatedAt: response.createdAt,
                });
            } else if (isTwitchPage(tabUrl)) {
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

                    setData({
                        platform: "twitch",
                        data: response.data,
                        cacheCreatedAt: response.createdAt,
                    });
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
                    setData({
                        platform: "twitch",
                        data: response.data,
                    });
                }
            } else if (isKickPage(tabUrl)) {
                if (!tabId) return;
                if (!isKickStream(tabUrl) && !isKickVod(tabUrl)) {
                    setMessage("Open a Kick stream");
                    return;
                }

                const response = await sendMessageToContentScript(tabId, {
                    type: "getKick",
                    isFromPopup: true,
                });
                if (!response?.success) {
                    throw new Error(response?.message || "Failed to retrieve Kick data");
                }
                setData({
                    platform: "kick",
                    data: response.data,
                    cacheCreatedAt: response.createdAt,
                });
            } else {
                setMessage("TubeSize works on YouTube, Twitch and Kick.");
            }
        })()
            .catch((err) => {
                console.error("[Popup Error]:", err);
                setError(err as Error);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [tabId, tabUrl]);

    const pageError = error || tabError;
    if (pageError) {
        throw pageError;
    }

    return (
        <div className="w-60">
            <Header data={data} />
            <div className="flex flex-col gap-2 px-3 py-1.5 text-xs text-zinc-400">
                {!isLoading && data?.platform === "youtube" && <PopupUsage tabId={tabId} />}

                {!data && isLoading && <Spinner />}

                {!data && !isLoading && message && <InfoCard message={message} />}
                {data?.platform === "youtube" && (
                    <YoutubeFormats data={data.data} tabId={tabId} tabUrl={tabUrl} />
                )}
                {data?.platform === "twitch" && <TwitchFormats data={data.data} />}
                {data?.platform === "kick" && <KickFormats data={data.data} />}
            </div>
        </div>
    );
}
