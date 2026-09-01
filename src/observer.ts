import { setToLocalCache } from "@lib/cache";
import { delay, extractVideoTag } from "@lib/utils";
import { getUsageByDay, getDateKey } from "@lib/analyticsUtils";
import { sendMessageToBackground } from "@/runtime";
import { updateBadge } from "@/badge";

let pendingUsage: number = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        pendingUsage += resource.transferSize;
    }
});

function getCurrentTabUrl() {
    return location.href;
}

void (async () => {
    const cachedVideos = new Set<string>();
    do {
        try {
            if (pendingUsage === 0) continue;

            const videoTag = extractVideoTag(getCurrentTabUrl());
            if (!videoTag) continue;

            const date = getDateKey(new Date());
            const usageByDay = (await getUsageByDay()) ?? {};

            let todayUsage = usageByDay[date];
            if (!todayUsage) {
                todayUsage = {};
                usageByDay[date] = todayUsage;
            }
            const videoUsage = (todayUsage[videoTag] ??= {
                usage: 0,
                title: undefined,
                thumbnailUrl: undefined,
                channelName: undefined,
            });

            // Get video info from background script if not cached
            if (!cachedVideos.has(videoTag)) {
                const res = await sendMessageToBackground({
                    type: "youtubeVideo",
                    videoTag,
                });
                if (!res.success) {
                    console.error("Failed to get video title from background script.");
                    continue;
                }

                videoUsage.title =
                    res.data.type === "video" ? res.data.title : res.data.channelName || "Youtube";
                videoUsage.thumbnailUrl =
                    res.data.thumbnailUrl || "https://www.youtube.com/img/desktop/yt_1200.png";
                videoUsage.channelName = res.data.channelName;
                cachedVideos.add(videoTag);
            }
            videoUsage.usage += pendingUsage;

            updateBadge(usageByDay);
            await setToLocalCache({ usageByDay });

            pendingUsage = 0;
        } catch (err) {
            console.error("Error in usage tracking loop:", err);
            if (err instanceof Error && err.message.includes("Extension context invalidated")) {
                return;
            }
            continue;
        } finally {
            await delay(5000);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition , no-constant-condition
    } while (true);
})();

observer.observe({
    type: "resource",
    buffered: true,
});
