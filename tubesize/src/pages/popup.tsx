import "@styles/popup.css";
import type {
    TwitchBackgroundResponse,
    TwitchMessage,
    YoutubeBackgroundResponse,
    YoutubeMessage,
} from "@app-types/types";
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

async function getTab() {
    return await chrome.tabs.query({ active: true, currentWindow: true });
}

async function getCurrentQuality(tabId: number): Promise<number | undefined> {
    return new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, { type: "getCurrentResolution" }, (response) => {
            if (chrome.runtime.lastError) {
                const errorMessage = chrome.runtime.lastError.message || "";

                if (errorMessage.includes("Receiving end does not exist")) {
                    return resolve(undefined);
                }
                return reject(new Error(errorMessage || "Failed to get current resolution"));
            }
            resolve(response);
        });
    });
}
type MessageResponseMap = {
    youtubeVideo: YoutubeBackgroundResponse;
    twitchVod: TwitchBackgroundResponse;
    twitchLive: TwitchBackgroundResponse;
};

async function sendMessageToBackground<T extends YoutubeMessage | TwitchMessage>(
    message: T,
): Promise<MessageResponseMap[T["type"]]> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ ...message }, (response) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            if (!response?.success) {
                reject(new Error(response?.message || "Failed to fetch video data"));
                return;
            }
            resolve(response);
        });
    });
}

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
    return await getFromSyncCache(CONFIG.optionIDs);
}

export default function Popup() {
    const [message, setMessage] = useState<string>(
        "Loading sizes for this video… (This might take a few seconds)",
    );

    const [pageType, setPageType] = useState<"youtube" | "twitch" | "default">("default");
    const [youtubeData, setYoutubeData] = useState<YoutubeBackgroundResponse | null>(null);
    const [twitchData, setTwitchData] = useState<TwitchBackgroundResponse | null>(null);
    const [cache, setCache] = useState<string | undefined>(undefined);
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [enabledOptions, setEnabledOptions] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);
    const [currentQuality, setCurrentQuality] = useState<number | undefined>(undefined);

    useEffect(() => {
        (async () => {
            try {
                const [tab] = await getTab();
                const url = tab?.url;

                if (!url) {
                    setMessage("No Active Tab found");
                    return;
                }

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
                        tabId: tab.id,
                    });
                    if (!response.success) throw new Error(response.message);
                    if (isShortsVideo(url)) response.isShorts = true;
                    setYoutubeData(response);
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
                        return;
                    }
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
                } else {
                    setMessage("Open a YouTube video or Twitch stream to view sizes");
                }
            } catch (err) {
                console.error("[Popup Error]:", err);
                setError(err as Error);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            try {
                const allOptions = await getOptions();
                const enabledOptions = CONFIG.optionIDs.filter((option) => {
                    return allOptions[option] ?? true;
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
                const [tab] = await getTab();
                if (!tab?.id) return;
                const quality = await getCurrentQuality(tab.id);
                setCurrentQuality(quality);
            } catch (err) {
                console.error(err);
            }
        })();
    }, []);

    if (error) {
        throw error;
    }

    if (useOptionsPage) {
        return <Options />;
    }

    return (
        <>
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
                                    isLive={youtubeData.data?.isLive}
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
                                />
                            );
                        })}
            </div>
        </>
    );
}
