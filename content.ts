import { extractVideoTag } from "./utils";

function init(videoTag: string) {
  const scriptsArray = Array.from(document.scripts);
  const ytInitialPlayerResponse = scriptsArray.find((script) => {
    return script.textContent?.includes("ytInitialPlayerResponse");
  });

  console.log(
    `[CONTENT.TS] parse ytInitial before sending to background:`,
    !!ytInitialPlayerResponse?.textContent,
  );

  if (!ytInitialPlayerResponse?.textContent) {
    console.warn(
      "[CONTENT.TS] ytInitialPlayerResponse script not found; skipping html in message.",
    );
  }

  chrome.runtime.sendMessage(
    {
      type: "sendYoutubeUrl",
      tag: videoTag,
      ...(ytInitialPlayerResponse?.textContent
        ? { html: ytInitialPlayerResponse.textContent }
        : {}),
    },
    (response) => {
      console.log(response);
    },
  );
}

window.addEventListener("yt-navigate-finish", () => {
  const url = window.location.href;
  const tag = extractVideoTag(url);
  if (tag) {
    chrome.runtime.sendMessage({ type: "setBadge", tag });
    init(tag);
  } else {
    chrome.runtime.sendMessage({ type: "clearBadge" });
  }
});
