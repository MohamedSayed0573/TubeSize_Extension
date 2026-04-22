import "@styles/popup.css";
import "@styles/global.css";
import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";
import { sendMessageToBackground, sendMessageToContentScript, getTab } from "@/runtime";
import { useEffect, useState } from "react";
import {
    extractVideoTag,
    isYoutubePage,
    isShortsVideo,
    isTwitchPage,
    extractTwitchChannelName,
    isTwitchVod,
    extractTwitchVodId,
    humanizeDuration,
} from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import YoutubeFormat from "@/components/youtubeFormat";
import TwitchFormat from "@/components/twitchFormat";

function getCachedAgo(createdAt: string | undefined) {
    if (!createdAt) return;
    const timeInMs = new Date().getTime() - new Date(createdAt).getTime();
    if (timeInMs < CONFIG.CACHE_JUST_NOW_THRESHOLD) {
        return "Cached just now";
    } else {
        const timeAgo = humanizeDuration(timeInMs);
        return `Cached ${timeAgo} ago`;
    }
}

async function getOptions() {
    const qualityIds = await getFromSyncCache("qualityIds");
    return qualityIds ?? {};
}

export default function Popup() {
    const [message, setMessage] = useState<string>("");
    const [isLoading, setIsLoading] = useState(true);

    const [tabId, setTabId] = useState<number | undefined>(undefined);
    const [tabUrl, setTabUrl] = useState<string | undefined>(undefined);
    const [pageType, setPageType] = useState<"youtube" | "twitch" | "default">("default");
    const [youtubeData, setYoutubeData] = useState<YoutubeBackgroundResponse | null>(null);
    const [twitchData, setTwitchData] = useState<TwitchBackgroundResponse | null>(null);
    const [cache, setCache] = useState<string | undefined>(undefined);
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [enabledOptions, setEnabledOptions] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [currentQuality, setCurrentQuality] = useState<number | undefined>(undefined);
    const [isLive, setIsLive] = useState<boolean>(false);

    useEffect(() => {
        (async () => {
            try {
                const activeTab = await getTab();
                setTabId(activeTab?.id);
                setTabUrl(activeTab?.url);
            } catch (err) {
                console.error("Failed to get active tab:", err);
                setError(new Error("Failed to get active tab"));
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const url = tabUrl;
                if (!url) return;

                setIsLoading(true);

                if (isYoutubePage(url)) {
                    setPageType("youtube");
                    const videoTag = extractVideoTag(url);
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
                    if (response.data?.videoFormats.length === 0) {
                        setError(new Error("No video formats found for this video"));
                        return;
                    }
                    if (isShortsVideo(url)) response.isShorts = true;
                    setYoutubeData(response);
                    setIsLive(response.data?.isLive || false);
                    setCache(
                        response.cached
                            ? getCachedAgo(response.createdAt) || "Cached just now"
                            : undefined,
                    );
                    setIsLoading(false);
                } else if (isTwitchPage(url)) {
                    setPageType("twitch");
                    if (isTwitchVod(url)) {
                        const vodId = extractTwitchVodId(url);
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
                        setTwitchData(response);
                        setCache(
                            response.cached
                                ? getCachedAgo(response.createdAt) || "Cached just now"
                                : undefined,
                        );
                        setIsLive(false);
                        setIsLoading(false);
                    } else {
                        const channelName = extractTwitchChannelName(url);
                        if (!channelName) {
                            setMessage("Open a Twitch stream");
                            setIsLoading(false);
                            return;
                        }

                        const response = await sendMessageToBackground({
                            type: "twitchLive",
                            channelName: channelName,
                        });
                        if (!response.success) throw new Error(response.message);
                        setTwitchData(response);
                        setIsLive(true);
                        setIsLoading(false);
                    }
                } else {
                    setMessage("TubeSize works on YouTube and Twitch only.");
                    setIsLoading(false);
                }
            } catch (err) {
                console.error("[Popup Error]:", err);
                setIsLoading(false);
                setError(err as Error);
            }
        })();
    }, [tabId, tabUrl]);

    useEffect(() => {
        (async () => {
            try {
                const qualityIds = await getOptions();
                const enabledOptions = CONFIG.optionIDs.filter((option) => {
                    return qualityIds[option] ?? true;
                });
                setEnabledOptions(enabledOptions);
            } catch (err) {
                console.error(err);
                setError(err as Error);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                if (!tabId) return;
                for (let attempt = 0; attempt < 5; attempt++) {
                    const quality = await sendMessageToContentScript(tabId, {
                        type: "getCurrentResolution",
                    });
                    if (quality !== undefined) {
                        setCurrentQuality(quality);
                        return;
                    }
                    await new Promise((resolve) => setTimeout(resolve, 500));
                }
            } catch (err) {
                console.error(err);
            }
        })();
    }, [tabId, tabUrl]);

    if (error) {
        throw error;
    }

    if (useOptionsPage) {
        return <Options />;
    }

    return (
        <div className="popup-page">
            <Header
                pageType={pageType}
                youtubeData={youtubeData}
                twitchData={twitchData}
                setUseOptionsPage={setUseOptionsPage}
            />
            <div id="container">
                {cache && <div className="cached-note">{cache}</div>}
                {!youtubeData && !twitchData && isLoading && (
                    <div className="loading-state">
                        <span className="spinner" />
                    </div>
                )}
                {!youtubeData && !twitchData && !isLoading && message && (
                    <span className="info">{message}</span>
                )}
                {youtubeData && enabledOptions.length === 0 && (
                    <span className="error">All Resolutions Disabled. Enable in options</span>
                )}
                {youtubeData &&
                    youtubeData?.data?.videoFormats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.height);
                        })
                        ?.map((item) => {
                            return (
                                <YoutubeFormat
                                    key={item.formatId}
                                    item={item}
                                    isLive={isLive}
                                    isShorts={youtubeData.isShorts}
                                    currentQuality={currentQuality}
                                />
                            );
                        })
                        .reverse()}
                {twitchData?.twitchData?.data &&
                    twitchData?.twitchData?.data
                        .sort((a, b) => b.bandwidth - a.bandwidth)
                        .map((item) => {
                            return (
                                <TwitchFormat
                                    key={item.resolution}
                                    item={item}
                                    currentQuality={currentQuality}
                                    isLive={isLive}
                                    durationSeconds={
                                        twitchData.twitchData?.type === "vod"
                                            ? twitchData.twitchData.durationSeconds
                                            : undefined
                                    }
                                />
                            );
                        })}
            </div>
        </div>
    );
}
