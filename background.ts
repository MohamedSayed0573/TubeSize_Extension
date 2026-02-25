console.log("[background] Service worker starting");

import ms from "ms";
import { filesize } from "filesize";
import type { APIData, HumanizedFormat, RawFormat } from "./types";
import { getFromStorage, saveToStorage } from "./cache";
import { addBadge, clearBadge } from "./badge";

chrome.runtime.onMessage.addListener(
    (
        message: {
            type: string;
            tag: string;
            tabId: number;
        },
        sender,
        sendResponse,
    ) => {
        if (message.type === "clearBadge") {
            clearBadge(sender.tab?.id);
            return true;
        }

        if (message.type !== "sendYoutubeUrl") {
            return;
        }

        const tag = message.tag;
        const tabId = sender.tab?.id ?? message.tabId;

        console.log(
            `[background] Received tag: ${tag} From ${sender.tab?.id ? "Content.js" : "Popup.js"}`,
        );

        clearBadge(tabId);

        (async () => {
            const cached = await getFromStorage(tag);

            // Cache Hit
            if (cached) {
                console.log("[background] Using cached data:", cached);

                // Set the badge to green checkmark
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: cached,
                    cached: true,
                });
                return;
            }

            // Cache Miss
            try {
                const data = await fetchVideoData(tag);
                const formattedData = await formatVideoResponse(data);
                saveToStorage(tag, formattedData);
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: formattedData,
                    cached: false,
                });
            } catch (err) {
                try {
                    console.log("[background] Scrape failed, trying API", err);
                    const apiData = await fetchAPI(tag);
                    saveToStorage(tag, apiData);
                    addBadge(tabId);
                    sendResponse({
                        success: true,
                        data: apiData,
                        cached: false,
                    });
                } catch (apiErr) {
                    clearBadge(tabId);
                    console.error("[background] API failed:", apiErr);
                    sendResponse({
                        success: false,
                        data: null,
                        cached: false,
                        message: apiErr,
                    });
                }
            }
        })();

        return true; // Return true synchronously to keep the message channel open
    },
);

const VIDEO_ITAGS = [394, 395, 396, 397, 398, 399];
const AUDIO_ITAG = 251;

async function fetchVideoData(videoTag: string) {
    let res;
    try {
        res = await fetch(`https://www.youtube.com/watch?v=${videoTag}`);
    } catch (err) {
        console.error(err);
        throw err;
    }
    const htmlText = await res.text();
    const match = htmlText.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/);
    //console.log(match[1]);
    if (!match || !match[1]) throw new Error("No match found");

    try {
        const data = JSON.parse(match[1]);
        if (!data) throw new Error("No data found");
        return data;
    } catch (e) {
        console.error("Failed to parse JSON", e);
        throw e;
    }
}
async function formatVideoResponse(data: any): Promise<HumanizedFormat> {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    const result: RawFormat = {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        author: data.videoDetails.author,
        duration: data.streamingData.adaptiveFormats[0].approxDurationMs,
        formats: data.streamingData.adaptiveFormats
            .filter((format: any) => {
                return VIDEO_ITAGS.includes(format.itag);
            })
            .map((format: any) => {
                return {
                    formatId: format.itag,
                    height: format.height,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
        audioFormats: data.streamingData.adaptiveFormats
            .filter((format: any) => {
                return format.itag === AUDIO_ITAG;
            })
            .map((format: any) => {
                return {
                    formatId: format.itag,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
    };

    const audioSize = getAverageAudioSize(result.audioFormats);
    const mergedFormats = mergeAudioWithVideo(result.formats, audioSize);
    const humanizedFormats = humanizeVideoFormats(mergedFormats);

    const final: HumanizedFormat = {
        id: result.id,
        title: result.title,
        author: result.author,
        duration: ms(parseInt(result.duration || "0")),
        videoFormats: humanizedFormats,
    };
    return final;
}

function humanizeVideoFormats(formats: RawFormat["formats"]) {
    return formats.map((format) => {
        return {
            ...format,
            size: filesize(format.size),
        };
    });
}

function getAverageAudioSize(audioFormatArray: RawFormat["audioFormats"]) {
    if (audioFormatArray.length === 0) return 0;
    if (audioFormatArray.length === 1) return audioFormatArray[0].size;
    return (
        audioFormatArray.reduce((acc, format) => {
            return acc + format.size;
        }, 0) / audioFormatArray.length
    );
}

function mergeAudioWithVideo(videoFormats: RawFormat["formats"], audioSize: number) {
    return videoFormats.map((videoFormat) => {
        return {
            ...videoFormat,
            size: (videoFormat.size as number) + audioSize,
        };
    });
}

async function fetchAPI(tag: string) {
    const humanReadableSizes = true;
    const mergeAudioWithVideo = true;
    const apiUrl = `${__API_URL__}/api/video-sizes/${tag}/?humanReadableSizes=${humanReadableSizes}&mergeAudioWithVideo=${mergeAudioWithVideo}`;
    console.log("[background] Fetching URL:", apiUrl);

    const res = await fetch(apiUrl, {
        method: "GET",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as APIData;
    console.log("[background] Got data:", data);
    return data;
}
