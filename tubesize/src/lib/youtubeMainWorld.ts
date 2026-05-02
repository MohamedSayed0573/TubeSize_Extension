import { waitForElement } from "@/qualityMenuInjector";

type MainWorldMessage = {
    source: "tubesize-content";
    type: "getVideoStats";
};
// eslint-disable-next-line @typescript-eslint/no-misused-promises
window.addEventListener("message", async (event) => {
    try {
        // eslint-disable-next-line unicorn/prefer-global-this
        if (event.source !== window) return;
        const message = event.data as MainWorldMessage;
        if (message?.source !== "tubesize-content" || message?.type !== "getVideoStats") return;

        const player = await waitForElement(".html5-video-player");
        if (!player) {
            throw new Error("Failed to find YouTube video player element");
        }

        const stats = (player as unknown as YoutubePlayer).getVideoStats?.();

        window.postMessage({
            source: "tubesize-main",
            type: "getVideoStats",
            data: stats,
        });
    } catch (err) {
        console.error("Error handling message in main world:", err);
        window.postMessage({
            source: "tubesize-main",
            type: "getVideoStats",
            data: undefined,
        });
    }
});

type YoutubePlayer = {
    getVideoStats: () => { fmt?: string; afmt?: string };
};
