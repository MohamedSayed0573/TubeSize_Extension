import { useEffect, useState } from "react";
import { extractVideoTag, isYoutubePage, isShortsVideo } from "./utils";
import "./styles/popup.css";
import type { BackgroundResponse } from "./types";
import CONFIG from "./constants";
import ms from "ms";

async function getTab() {
    return await chrome.tabs.query({ active: true, currentWindow: true });
}

async function sendMessageToBackground(tabId: number, videoTag: string) {
    return new Promise<BackgroundResponse>((resolve, reject) => {
        chrome.runtime.sendMessage(
            { type: "sendYoutubeUrl", tag: videoTag, tabId: tabId },
            (response) => {
                if (!response.success) {
                    reject(new Error(chrome.runtime.lastError?.message));
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
        return "Just now";
    } else {
        const timeAgo = ms(timeInMs, { long: true });
        return timeAgo;
    }
}

function optionsBtnOnChange() {
    return () => {
        window.location.href = "options.html";
    };
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
            } catch (err) {
                setMessage({ type: "error", message: "Error: " + err });
            }
        })();
    }, []);

    return (
        <>
            <div className="header">
                <div className="title" title={videoData?.data?.title}>
                    {videoData?.data?.title ?? "TubeSize"}
                </div>
                <span className="duration" id="duration-display">
                    {videoData?.data?.duration}
                </span>
                <button id="optionsBtn" onClick={optionsBtnOnChange()}>
                    Options
                </button>
            </div>
            <div id="container">
                <div className="cached-note">
                    {videoData?.cached ? getCachedAgo(videoData.createdAt) : null}
                </div>
                {!videoData ? (
                    <span className={message.type}> {message.message}</span>
                ) : (
                    videoData?.data?.videoFormats
                        ?.map((item) => {
                            return (
                                <div className="format-item">
                                    <div className="format-size">{item.size}</div>
                                    <div className="format-height"> {item.height} </div>
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
