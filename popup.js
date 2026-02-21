const statusEl = document.getElementById("status");
const durationDisplay = document.getElementById("duration-display");
const titleDisplay = document.getElementById("title-display");
const audioDisplay = document.getElementById("audio-display");

import ms from "ms";

function showError(msg) {
    console.error("[popup] Error:", msg);
    statusEl.textContent = `Error: ${msg}`;
    statusEl.className = "error";
}

function showInfo(msg) {
    console.log("[popup] Info:", msg);
    statusEl.textContent = msg;
    statusEl.className = "info";
}

function displayVideoInfo(data) {
    try {
        if (!data) {
            showError("Missing video data");
            return;
        }

        // Update title, duration, and audio in header
        if (data.title) {
            titleDisplay.textContent = data.title;
            titleDisplay.title = data.title;
        }
        if (data.duration) {
            durationDisplay.textContent = data.duration;
        }
        if (data.audioFormat) {
            audioDisplay.textContent = data.audioFormat;
        }

        // Display only video formats
        if (data.videoFormats && data.videoFormats.length > 0) {
            statusEl.textContent = ""; // Clear existing content
            statusEl.className = "";

            const section = document.createElement("div");
            section.className = "formats-section";

            data.videoFormats.forEach((format) => {
                const item = document.createElement("div");
                item.className = "format-item";

                const heightDiv = document.createElement("div");
                heightDiv.className = "format-height";
                heightDiv.textContent = `${format.height}p:`;

                const sizeDiv = document.createElement("div");
                sizeDiv.className = "format-size";
                sizeDiv.textContent = format.filesize;

                item.append(heightDiv, sizeDiv);
                section.appendChild(item);
            });

            statusEl.appendChild(section);
        } else {
            showError("No video formats found");
        }
    } catch (e) {
        console.error("[popup] Error displaying data:", e.message);
        showError("Failed to display video data: " + e.message);
    }
}

function extractVideoTag(url) {
    const parsedUrl = new URL(url);
    const videoTag = parsedUrl.searchParams.get("v");
    if (!videoTag) return null;

    const regex = /^[a-zA-Z0-9_-]{11}$/;
    if (!regex.test(videoTag)) {
        throw new Error("Invalid YouTube video URL");
    }
    return videoTag;
}

function isYoutubeVideo(url) {
    return new URL(url).hostname.includes("youtube.com");
}

function showCachedNote(createdAt) {
    const now = new Date();
    const createdDate = new Date(createdAt);
    const diff = now - createdDate;
    const humanAgo = ms(diff) + " ago";
    console.log("[popup] Video info cached", humanAgo);

    const note = document.createElement("div");
    note.className = "cached-note";
    note.textContent = `Cached ${humanAgo}`;
    statusEl.prepend(note);
}

function 

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];

    if (!tab) {
        showInfo("No active tab found");
        return;
    }
    const url = tab.url;
    if (!isYoutubeVideo(url)) {
        showInfo("Not a YouTube video page");
        return;
    }

    const tag = extractVideoTag(url);
    if (!tag) {
        showInfo("Open a Youtube video");
        return;
    }

    chrome.runtime.sendMessage(
        { type: "sendYoutubeUrl", value: tag, tabId: tab.id },
        (response) => {
            if (response?.success) {
                displayVideoInfo(response.data);
                if (response.cached) {
                    showCachedNote(response.data.createdAt);
                }
            } else {
                showError(response?.message || "Unknown error - check console");
            }
        },
    );
});
