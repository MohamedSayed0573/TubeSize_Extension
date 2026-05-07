import "@styles/popup.css";
import "@styles/global.css";
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
    humanizeDuration,
    isKickStream,
    isKickVod,
} from "@lib/utils";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import useTab from "@hooks/useTab";
import TotalUsage from "@components/usage";
import YoutubeFormats from "@components/youtubeFormats";
import TwitchFormats from "@components/twitchFormats";
import KickFormats from "@components/kickFormats";
import type { PopupData } from "@app-types/uiTypes";

function getCachedAgo(createdAt: string | undefined) {
    if (!createdAt) return;
    const timeInMs = Date.now() - new Date(createdAt).getTime();
    if (timeInMs < CONFIG.CACHE_JUST_NOW_THRESHOLD) {
        return "Cached just now";
    } else {
        const timeAgo = humanizeDuration(timeInMs);
        return `Cached ${timeAgo} ago`;
    }
}

export default function Popup() {
    const [message, setMessage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);
    const { tabId, tabUrl, error: tabError } = useTab();
    const [data, setData] = useState<PopupData | undefined>();
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [error, setError] = useState<Error | undefined>();

    useEffect(() => {
        (async () => {
            if (!tabUrl) return;

            setIsLoading(true);

            if (isYoutubePage(tabUrl)) {
                const videoTag = extractVideoTag(tabUrl);
                if (!videoTag) {
                    setMessage("Open a Youtube video");
                    setIsLoading(false);
                    return;
                }

                const response = await sendMessageToBackground({
                    type: "youtubeVideo",
                    videoTag,
                    tabId,
                });
                if (!response.success) throw new Error(response.message);
                if (response.data.formats.length === 0) {
                    setError(new Error("No video formats found for this video"));
                    setIsLoading(false);
                    return;
                }
                if (response.data.type === "video" && isShortsVideo(tabUrl)) {
                    response.data.isShorts = true;
                }
                setData({
                    platform: "youtube",
                    data: response.data,
                    cacheCreatedAt: response.createdAt,
                });
                setIsLoading(false);
            } else if (isTwitchPage(tabUrl)) {
                if (isTwitchVod(tabUrl)) {
                    const vodId = extractTwitchVodId(tabUrl);
                    if (!vodId) {
                        setMessage("Open a Twitch stream or VOD");
                        setIsLoading(false);
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
                    setIsLoading(false);
                } else {
                    const channelName = extractChannelName(tabUrl);
                    if (!channelName) {
                        setMessage("Open a Twitch stream");
                        setIsLoading(false);
                        return;
                    }

                    const response = await sendMessageToBackground({
                        type: "twitchLive",
                        channelName: channelName,
                        fromPopup: true,
                    });
                    if (!response.success) throw new Error(response.message);
                    setData({
                        platform: "twitch",
                        data: response.data,
                    });
                    setIsLoading(false);
                }
            } else if (isKickPage(tabUrl)) {
                if (!tabId) return;
                if (!isKickStream(tabUrl) && !isKickVod(tabUrl)) {
                    setMessage("Open a Kick stream");
                    setIsLoading(false);
                    return;
                }

                const response = await sendMessageToContentScript(tabId, {
                    type: "getKick",
                    fromPopup: true,
                });
                if (!response?.success) {
                    throw new Error(response?.message || "Failed to retrieve Kick data");
                }
                setData({
                    platform: "kick",
                    data: response.data,
                    cacheCreatedAt: response.createdAt,
                });
                setIsLoading(false);
            } else {
                setMessage("TubeSize works on YouTube, Twitch and Kick.");
                setIsLoading(false);
            }
        })().catch((err) => {
            console.error("[Popup Error]:", err);
            setIsLoading(false);
            setError(err as Error);
        });
    }, [tabId, tabUrl]);

    const pageError = error || tabError;
    if (pageError) {
        throw pageError;
    }

    if (useOptionsPage) {
        return <Options />;
    }

    return (
        <div className="popup-page">
            <Header data={data} setUseOptionsPage={setUseOptionsPage} />
            <div id="container">
                {!isLoading && data?.platform === "youtube" && <TotalUsage tabId={tabId} />}

                {data?.cacheCreatedAt && (
                    <div className="cached-note">{getCachedAgo(data.cacheCreatedAt)}</div>
                )}

                {!data && isLoading && (
                    <div className="loading-state">
                        <span className="spinner" />
                    </div>
                )}

                {!data && !isLoading && message && <span className="info">{message}</span>}
                {data?.platform === "youtube" && (
                    <YoutubeFormats data={data.data} tabId={tabId} tabUrl={tabUrl} />
                )}
                {data?.platform === "twitch" && <TwitchFormats data={data.data} />}
                {data?.platform === "kick" && <KickFormats data={data.data} />}
            </div>
        </div>
    );
}
