console.log("[background] Service worker starting");

import ms from "ms";
import { filesize } from "filesize";
import type { APIData, BackgroundResponse, HumanizedFormat, RawData, RawFormat } from "./types";
import { getFromStorage, saveToStorage } from "./cache";
import { addBadge, clearBadge } from "./badge";

chrome.runtime.onMessage.addListener(
    (
        message: {
            type: string;
            tag: string;
            tabId?: number;
            html?: string;
        },
        sender,
        sendResponse: (response: BackgroundResponse) => void,
    ) => {
        if (message.type === "clearBadge") {
            clearBadge(sender.tab?.id);
            return;
        }
        if (message.type === "setBadge") {
            addBadge(sender.tab?.id);
            return;
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
                    data: cached.response,
                    cached: true,
                    createdAt: cached.createdAt,
                });
                return;
            }

            // Cache Miss
            try {
                let data;
                if (message.html) {
                    try {
                        data = extractYtInitial(message.html);
                    } catch (err) {
                        data = await fetchVideoData(tag);
                        console.error(
                            "[background]: Failed to parse html from content script, fetching...",
                            err,
                        );
                    }
                } else {
                    data = await fetchVideoData(tag);
                }

                const rawFormats = formatVideoResponse(data);
                const formattedData = humanizeData(rawFormats);

                await saveToStorage(tag, formattedData);
                addBadge(tabId);
                sendResponse({
                    success: true,
                    data: formattedData,
                    cached: false,
                    api: false,
                });
            } catch (err) {
                try {
                    console.error("[background] Scrape failed, trying API", err);
                    const apiData = await fetchAPI(tag);
                    await saveToStorage(tag, apiData);
                    addBadge(tabId);
                    sendResponse({
                        success: true,
                        data: apiData,
                        cached: false,
                        api: true,
                    });
                } catch (apiErr) {
                    clearBadge(tabId);
                    console.error("[background] API failed:", apiErr);
                    sendResponse({
                        success: false,
                        data: null,
                        cached: false,
                        message: apiErr instanceof Error ? apiErr.message : "Unknown error",
                    });
                }
            }
        })();

        return true; // Return true to keep the message channel open, because we have async operations
    },
);

const VIDEO_ITAGS: Set<number> = new Set([
    394, // 144p
    395, // 240p
    396, // 360p
    397, // 480p
    398, // 720p
    399, // 1080p
]);

const AUDIO_ITAG = 251;

async function fetchVideoData(videoTag: string) {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoTag}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fetchedHtml = await res.text();
    return extractYtInitial(fetchedHtml);
}

function extractYtInitial(html: string): RawData {
    const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
    if (!match || !match[1]) throw new Error("No match found");
    const data = JSON.parse(match[1]);
    if (!data) throw new Error("No data found");
    return data;
}

function formatVideoResponse(data: RawData): RawFormat {
    if (!data || !data.videoDetails || !data.streamingData || !data.streamingData.adaptiveFormats)
        throw new Error("No data found");

    return {
        id: data.videoDetails.videoId,
        title: data.videoDetails.title,
        duration: data.videoDetails.lengthSeconds,
        formats: data.streamingData.adaptiveFormats
            .filter((format) => {
                return VIDEO_ITAGS.has(format.itag);
            })
            .map((format) => {
                return {
                    formatId: format.itag,
                    height: format.height,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
        audioFormats: data.streamingData.adaptiveFormats
            .filter((format) => {
                return format.itag === AUDIO_ITAG;
            })
            .map((format) => {
                return {
                    formatId: format.itag,
                    size: parseInt(format.contentLength || "0"),
                };
            }),
    };
}

function humanizeData(formats: RawFormat): HumanizedFormat {
    const audioSize = getAverageAudioSize(formats.audioFormats);
    const mergedFormats = mergeAudioWithVideo(formats.formats, audioSize);
    const humanizedFormats = humanizeVideoFormats(mergedFormats);

    return {
        id: formats.id,
        title: formats.title,
        duration: ms(parseInt(formats.duration || "0") * 1000),
        videoFormats: humanizedFormats,
    };
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
    // Note: ytInitialPlayerResponse usually returns three formats with itag 251, so we take the average of the content size of all three.
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
            size: videoFormat.size + audioSize,
        };
    });
}

async function fetchAPI(tag: string) {
    const apiUrl = `${__API_URL__}/api/video-sizes/${tag}?humanReadableSizes=true&mergeAudioWithVideo=true`;
    console.log("[background] Fetching URL:", apiUrl);

    const res = await fetch(apiUrl, {
        method: "GET",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = (await res.json()) as APIData;
    console.log("[background] Got data:", data);
    return data;
}
