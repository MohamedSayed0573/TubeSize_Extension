import type { APIData, BackgroundResponse, HumanizedFormat } from "./types";
import { extractVideoTag, getOptions, optionIDs, getElement } from "./utils";
import ms from "ms";

const containerEl = getElement("container", true);
const durationDisplay = getElement("duration-display");
const titleDisplay = getElement("title-display");
const audioDisplay = getElement("audio-display");
const optionsBtn = getElement("optionsBtn", true);

function showStatus(message: string, type: "info" | "error") {
    if (type === "info") {
        console.log("[popup] Info:", message);
        containerEl.className = "info";
        containerEl.textContent = message;
    } else {
        console.error("[popup] Error:", message);
        containerEl.className = "error";
        containerEl.textContent = `Error: ${message}`;
    }
}

optionsBtn.addEventListener("click", () => {
    window.location.href = "options.html";
});

async function displayVideoInfo(data: APIData | HumanizedFormat) {
    try {
        if (!data) {
            showStatus("Missing video data", "error");
            return;
        }

        // Update title, duration, and audio in header
        if (titleDisplay && data.title) {
            titleDisplay.textContent = data.title;
            titleDisplay.title = data.title;
        }
        if (durationDisplay && data.duration) {
            durationDisplay.textContent = data.duration;
        }

        // Note: audioFormat only exists in APIData
        if (audioDisplay && "audioFormat" in data && data.audioFormat) {
            audioDisplay.textContent = data.audioFormat;
        }

        // Display video formats
        if (data.videoFormats && data.videoFormats.length > 0) {
            containerEl.textContent = ""; // Clear existing content

            const section = document.createElement("div");
            section.className = "formats-section";

            const options = await getOptions();
            const enabledOptions = optionIDs.filter((optionId) => {
                return options[optionId] ?? true;
            });
            if (enabledOptions.length === 0) {
                showStatus("All Resolutions Disabled. Enable in options", "info");
                return;
            }

            data.videoFormats.forEach((format) => {
                // Make the format height compatible with the element IDs
                const optionKey = format.height ? "p" + format.height : null;
                if (!optionKey || !enabledOptions.includes(optionKey)) {
                    return;
                }

                const item = document.createElement("div");
                item.className = "format-item";

                const heightDiv = document.createElement("div");
                heightDiv.className = "format-height";
                heightDiv.textContent = `${format.height}p:`;

                const sizeDiv = document.createElement("div");
                sizeDiv.className = "format-size";
                sizeDiv.textContent = format.size;

                item.append(heightDiv, sizeDiv);
                section.append(item);
            });

            containerEl.append(section);
        } else {
            showStatus("No video formats found", "error");
        }
    } catch (e) {
        if (e instanceof Error) {
            console.error("[popup] Error displaying data:", e.message);
            showStatus("Failed to display video data: " + e.message, "error");
        }
    }
}

function isYoutubeVideo(url: string) {
    if (!url) return false;
    return new URL(url).hostname.includes("youtube.com");
}

function showCachedNote(createdAt: string | undefined) {
    if (!createdAt) return;

    const note = document.createElement("div");
    note.className = "cached-note";

    const timeInMS = new Date().getTime() - new Date(createdAt).getTime();
    if (timeInMS < 5000) {
        note.textContent = "Just now";
    } else {
        const timeAgo = ms(timeInMS);
        note.textContent = `Cached ${timeAgo} ago`;
    }
    console.log("[popup] Video info cached", note.textContent);
    containerEl.prepend(note);
}

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];

    if (!tab) {
        showStatus("No active tab found", "info");
        return;
    }

    const url = tab.url;
    if (!url || !isYoutubeVideo(url)) {
        showStatus("Not a YouTube video page", "info");
        return;
    }

    const tag = extractVideoTag(url);
    if (!tag) {
        showStatus("Open a Youtube video", "info");
        return;
    }

    chrome.runtime.sendMessage(
        { type: "sendYoutubeUrl", tag, tabId: tab.id },
        (response: BackgroundResponse) => {
            if (response?.success && response.data) {
                displayVideoInfo(response.data);
                if (response.cached) {
                    showCachedNote(response.createdAt);
                }
            } else {
                showStatus(response?.message || "Unknown error - check console", "error");
            }
        },
    );
});
