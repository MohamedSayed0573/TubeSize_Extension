import "@styles/popup.css";
import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";
import { useEffect, useState } from "react";
import {
    extractVideoTag,
    isYoutubePage,
    isShortsVideo,
    isTwitchPage,
    extractTwitchChannelName,
} from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import ms from "ms";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import YoutubeFormat from "@/components/youtubeFormat";
import TwitchFormat from "@/components/twitchFormat";

async function getTab() {
    return await chrome.tabs.query({ active: true, currentWindow: true });
}

async function sendMessageToBackground(
    type: "sendYoutubeUrl",
    videoTag: string,
    tabId: number,
): Promise<YoutubeBackgroundResponse>;
async function sendMessageToBackground(
    type: "sendTwitchUrl",
    videoTag: string,
    tabId?: number,
): Promise<TwitchBackgroundResponse>;

async function sendMessageToBackground(
    type: "sendYoutubeUrl" | "sendTwitchUrl",
    videoTag: string,
    tabId?: number,
) {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type, tag: videoTag, tabId: tabId },
            (response: YoutubeBackgroundResponse | TwitchBackgroundResponse) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!response?.success) {
                    reject(new Error(response?.message || "Failed to fetch video data"));
                    return;
                }
                if (type === "sendTwitchUrl") resolve(response as TwitchBackgroundResponse);
                else resolve(response as YoutubeBackgroundResponse);
            },
        );
    });
}

function getCachedAgo(createdAt: string | undefined) {
    if (!createdAt) return;
    const timeInMs = new Date().getTime() - new Date(createdAt).getTime();
    if (timeInMs < CONFIG.CACHE_JUST_NOW_THRESHOLD) {
        return "Cached just now";
    } else {
        const timeAgo = ms(timeInMs, { long: true });
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
    const [note, setNote] = useState<string | null>(null);
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [enabledOptions, setEnabledOptions] = useState<string[]>([]);
    const [error, setError] = useState<Error | null>(null);

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
                    const tag = extractVideoTag(url);
                    if (!tag) {
                        setMessage("Open a Youtube video");
                        return;
                    }

                    const response = await sendMessageToBackground("sendYoutubeUrl", tag, tab.id!);
                    if (!response.success) throw new Error(response.message);
                    if (response.api)
                        setNote("Used API. Execution time: " + response.executionTime);
                    if (isShortsVideo(url)) response.isShorts = true;
                    setYoutubeData(response);
                    setCache(
                        response.cached
                            ? getCachedAgo(response.createdAt) || "Cached just now"
                            : undefined,
                    );
                } else if (isTwitchPage(url)) {
                    setPageType("twitch");
                    const channelName = extractTwitchChannelName(url);
                    if (!channelName) {
                        setMessage("Open a Twitch stream");
                        return;
                    }

                    const response = await sendMessageToBackground("sendTwitchUrl", channelName);
                    if (!response.success) throw new Error(response.message);
                    setTwitchData(response);
                } else {
                    setMessage("Open a YouTube video or Twitch stream to view sizes");
                }
            } catch (err: any) {
                console.error("[Popup Error]:", err);
                setError(err);
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
            } catch (err: any) {
                console.error(err);
                setError(err);
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
                {note && <div className="cached-note">{note}</div>}
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
                                />
                            );
                        })
                        .reverse()}
                {twitchData?.twitchData?.data &&
                    twitchData?.twitchData?.data
                        .map((item: any) => {
                            return <TwitchFormat key={item.resolution} item={item} />;
                        })
                        .sort((a, b) => b.props.item.bandwidth - a.props.item.bandwidth)}
            </div>
        </>
    );
}
