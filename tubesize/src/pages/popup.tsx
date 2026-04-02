import "@styles/popup.css";
import type { BackgroundResponse } from "@app-types/types";
import { useEffect, useState } from "react";
import { extractVideoTag, isYoutubePage, isShortsVideo } from "@lib/utils";
import { getFromSyncCache } from "@lib/cache";
import ms from "ms";
import Options from "@pages/options";
import CONFIG from "@lib/constants";
import Header from "@components/header";
import VideoFormat from "@components/videoFormat";

async function getTab() {
    return await chrome.tabs.query({ active: true, currentWindow: true });
}

async function sendMessageToBackground(
    tabId: number,
    videoTag: string,
): Promise<BackgroundResponse> {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: "sendYoutubeUrl", tag: videoTag, tabId: tabId },
            (response: BackgroundResponse) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (!response?.success) {
                    reject(new Error(response?.message || "Failed to fetch video data"));
                    return;
                }
                resolve(response);
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

    const [videoData, setVideoData] = useState<BackgroundResponse | null>(null);
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

                if (!isYoutubePage(url)) {
                    setMessage("Not a YouTube video page");
                    return;
                }

                if (isShortsVideo(url)) {
                    setMessage("Shorts Videos are not supported");
                    return;
                }

                const tag = extractVideoTag(url);
                if (!tag) {
                    setMessage("Open a Youtube video");
                    return;
                }

                const response = await sendMessageToBackground(tab.id!, tag);
                if (!response.success) throw new Error(response.message);
                if (response.isLive) throw new Error("Live videos are not supported");
                if (response.api) setNote("Used API. Execution time: " + response.executionTime);
                setVideoData(response);
                setCache(
                    response.cached
                        ? getCachedAgo(response.createdAt) || "Cached just now"
                        : undefined,
                );
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
            <Header videoData={videoData} setUseOptionsPage={setUseOptionsPage} />
            <div id="container">
                {cache && <div className="cached-note">{cache}</div>}
                {note && <div className="cached-note">{note}</div>}
                {!videoData ? (
                    <span className="info">{message}</span>
                ) : enabledOptions.length === 0 ? (
                    <span className="error">All Resolutions Disabled. Enable in options</span>
                ) : (
                    videoData?.data?.videoFormats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.height);
                        })
                        ?.map((item) => {
                            return <VideoFormat key={item.formatId} item={item} />;
                        })
                        .reverse()
                )}
            </div>
        </>
    );
}
