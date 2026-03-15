import { useEffect, useState } from "react";
import { extractVideoTag, isYoutubePage, isShortsVideo } from "../utils";
import Options from "./options.tsx";
import "../styles/popup.css";
import type { BackgroundResponse } from "../types/types.ts";
import CONFIG from "../constants";
import ms from "ms";
import { getFromSyncCache } from "../cache.ts";

async function getTab() {
    return await chrome.tabs.query({ active: true, currentWindow: true });
}

async function sendMessageToBackground(tabId: number, videoTag: string) {
    return new Promise<BackgroundResponse>((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: "sendYoutubeUrl", tag: videoTag, tabId: tabId },
            (response) => {
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

type Message = {
    type: "info" | "error";
    message: string;
};

function Popup() {
    const [message, setMessage] = useState<Message>({
        type: "info",
        message: "Loading sizes for this video… (This might take a few seconds)",
    });

    const [videoData, setVideoData] = useState<BackgroundResponse | null>(null);
    const [cache, setCache] = useState<string | undefined>(undefined);
    const [useOptionsPage, setUseOptionsPage] = useState(false);
    const [enabledOptions, setEnabledOptions] = useState<string[]>([]);

    useEffect(() => {
        (async () => {
            try {
                const [tab] = await getTab();
                const url = tab?.url;

                if (!url) {
                    setMessage({ type: "info", message: "No Active Tab found" });
                    return;
                }

                if (!isYoutubePage(url)) {
                    setMessage({ type: "info", message: "Not a YouTube video page" });
                    return;
                }

                if (isShortsVideo(url)) {
                    setMessage({ type: "info", message: "Shorts Videos are not supported" });
                    return;
                }

                const tag = extractVideoTag(url);
                if (!tag) {
                    setMessage({ type: "info", message: "Open a Youtube video" });
                    return;
                }

                const response = await sendMessageToBackground(tab.id!, tag);
                setVideoData(response);
                setCache(getCachedAgo(response.createdAt) || "Cached just now");
            } catch (err) {
                const errorMessage = err instanceof Error ? err.message : String(err);
                console.error("[Popup Error]:", errorMessage);
                setMessage({ type: "error", message: errorMessage });
                setVideoData(null);
                setCache(undefined);
            }
        })();
    }, []);

    useEffect(() => {
        (async () => {
            const allOptions = await getOptions();
            const enabledOptions = CONFIG.optionIDs.filter((option) => {
                return allOptions[option] ?? true;
            });
            setEnabledOptions(enabledOptions);
        })();
    }, []);

    if (useOptionsPage) {
        return <Options />;
    }

    return (
        <>
            <div className="header">
                <div className="title" title={videoData?.data?.title}>
                    {videoData?.data?.title ?? "TubeSize"}
                </div>
                <span className="duration" id="duration-display">
                    {videoData?.data?.duration}
                </span>
                <button id="optionsBtn" onClick={() => setUseOptionsPage(true)}>
                    Options
                </button>
            </div>
            <div id="container">
                {cache && <div className="cached-note">{cache}</div>}
                {!videoData ? (
                    <span className={message.type}> {message.message}</span>
                ) : enabledOptions.length === 0 ? (
                    <span className="error">All Resolutions Disabled. Enable in options</span>
                ) : (
                    videoData?.data?.videoFormats
                        ?.filter((item) => {
                            return enabledOptions.includes("p" + item.height);
                        })
                        ?.map((item) => {
                            return (
                                <div className="format-item" key={item.formatId}>
                                    <div className="format-height"> {item.height} </div>
                                    <div className="format-size">{item.size}</div>
                                </div>
                            );
                        })
                        .reverse()
                )}
            </div>
        </>
    );
}

export default Popup;
