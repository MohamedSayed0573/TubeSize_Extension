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
    console.log("Fetching options from cache...");
    const qualityIds = await getFromSyncCache("qualityIds");
    console.log("Fetched options:", qualityIds);
    return qualityIds ?? {};
}

export default function Popup() {
    const [message, setMessage] = useState<string>(
        "Loading sizes for this video… (This might take a few seconds)",
    );

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
                const activeTabs = await getTab();
                setTabId(activeTabs[0]?.id);
                setTabUrl(activeTabs[0]?.url);
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

                if (isYoutubePage(url)) {
                    setPageType("youtube");
                    const videoTag = extractVideoTag(url);
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
                } else if (isTwitchPage(url)) {
                    setPageType("twitch");
                    if (isTwitchVod(url)) {
                        const vodId = extractTwitchVodId(url);
                        if (!vodId) {
                            setMessage("Open a Twitch stream or VOD");
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
                    } else {
                        const channelName = extractTwitchChannelName(url);
                        if (!channelName) {
                            setMessage("Open a Twitch stream");
                            return;
                        }

                        const response = await sendMessageToBackground({
                            type: "twitchLive",
                            channelName: channelName,
                        });
                        if (!response.success) throw new Error(response.message);
                        setTwitchData(response);
                        setIsLive(true);
                    }
                } else {
                    setMessage("TubeSize works on YouTube and Twitch only.");
                }
            } catch (err) {
                console.error("[Popup Error]:", err);
                setError(err as Error);
            }
        })();
    }, [tabId, tabUrl]);

    useEffect(() => {
        (async () => {
            try {
                const qualityIds = await getOptions();
                console.log("Enabled quality options:", qualityIds);
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
                const quality = await sendMessageToContentScript(tabId, {
                    type: "getCurrentResolution",
                });
                if (!quality) console.log("No current quality set");
                setCurrentQuality(quality);
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
                {!youtubeData && !twitchData && <span className="info">{message}</span>}
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
