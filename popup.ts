const statusEl = document.getElementById("status")!;
const durationDisplay = document.getElementById("duration-display")!;
const titleDisplay = document.getElementById("title-display")!;
const audioDisplay = document.getElementById("audio-display")!;

import type { APIData, ApiResponse, HumanizedFormat } from "./types";
import ms from "ms";
import { extractVideoTag } from "./utils";

function showError(msg: string) {
  console.error("[popup] Error:", msg);
  statusEl.textContent = `Error: ${msg}`;
  statusEl.className = "error";
}

function showInfo(msg: string) {
  console.log("[popup] Info:", msg);
  statusEl.textContent = msg;
  statusEl.className = "info";
}

function displayVideoInfo(data: APIData | HumanizedFormat) {
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

    // Note: audioFormat only exists in APIData
    if ("audioFormat" in data && data.audioFormat) {
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
        sizeDiv.textContent = format.size;

        item.append(heightDiv, sizeDiv);
        section.appendChild(item);
      });

      statusEl.appendChild(section);
    } else {
      showError("No video formats found");
    }
  } catch (e) {
    if (e instanceof Error) {
      console.error("[popup] Error displaying data:", e.message);
      showError("Failed to display video data: " + e.message);
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
  statusEl.prepend(note);
}

chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
  const tab = tabs[0];

  if (!tab) {
    showInfo("No active tab found");
    return;
  }

  const url = tab.url;
  if (!url || !isYoutubeVideo(url)) {
    showInfo("Not a YouTube video page");
    return;
  }

  const tag = extractVideoTag(url);
  if (!tag) {
    showInfo("Open a Youtube video");
    return;
  }

  chrome.runtime.sendMessage(
    { type: "sendYoutubeUrl", tag, tabId: tab.id },
    (response: ApiResponse) => {
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
