import { setToLocalCache } from "@lib/cache";
import { delay, extractVideoTag } from "@lib/utils";
import { getUsageByDay, getDateKey } from "@lib/analyticsUtils";
import { sendMessageToBackground } from "@/runtime";
import { updateBadge } from "@/badge";

let pendingUsage: number = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        pendingUsage += resource.transferSize; // eslint-disable-line unicorn/no-top-level-assignment-in-function
    }
});

function getCurrentTabUrl() {
    return location.href;
}

void (async () => {
    const CACHED_VIDEOS = new Set<string>();
    do {
        try {
            if (pendingUsage === 0) continue;

            const videoTag = extractVideoTag(getCurrentTabUrl());
            if (!videoTag) continue;

            const date = getDateKey(new Date());
            const usageByDay = await getUsageByDay();
            usageByDay[date] ??= {};
            usageByDay[date][videoTag] ??= {
                usage: 0,
                title: undefined,
                thumbnailUrl: undefined,
                channelName: undefined,
            };

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const oldUsage = usageByDay?.[date]?.[videoTag]?.usage || 0;

            if (!CACHED_VIDEOS.has(videoTag)) {
                const res = await sendMessageToBackground({
                    type: "youtubeVideo",
                    videoTag,
                });
                if (!res.success) {
                    console.error("Failed to get video title from background script.");
                    continue;
                }

                usageByDay[date][videoTag].title =
                    res.data.type === "video" ? res.data.title : res.data.channelName || "Youtube";
                usageByDay[date][videoTag].thumbnailUrl =
                    res.data.thumbnailUrl || "https://www.youtube.com/img/desktop/yt_1200.png";
                usageByDay[date][videoTag].channelName = res.data.channelName;
                CACHED_VIDEOS.add(videoTag);
            }
            usageByDay[date][videoTag].usage = oldUsage + pendingUsage;
            updateBadge(usageByDay, date);
            await setToLocalCache({ usageByDay });

            pendingUsage = 0; // eslint-disable-line unicorn/no-top-level-assignment-in-function
        } catch (err) {
            console.error("Error in usage tracking loop:", err);
            continue;
        } finally {
            await delay(5000);
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition , no-constant-condition
    } while (true);
})().catch((err) => {
    console.error("Error in usage tracking loop:", err);
});

observer.observe({
    type: "resource",
    buffered: true,
});
