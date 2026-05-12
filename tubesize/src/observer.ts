import { setToLocalCache } from "@lib/cache";
import { delay, extractVideoTag } from "@lib/utils";
import { getUsageByDay } from "@lib/analyticsUtils";
import { sendMessageToBackground } from "./runtime";

let pendingUsage: number = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        pendingUsage += resource.transferSize;
    }
});

function getCurrentTabUrl() {
    return globalThis.location.href;
}

void (async () => {
    do {
        try {
            const videoTag = extractVideoTag(getCurrentTabUrl());
            if (!videoTag) {
                await delay(10_000);
                continue;
            }

            const date = new Date().toISOString().split("T")[0];
            const usageByDay = await getUsageByDay();
            usageByDay[date] ??= {};
            usageByDay[date][videoTag] ??= {
                usage: 0,
                title: undefined,
                thumbnailUrl: undefined,
            };

            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            const oldUsage = usageByDay?.[date]?.[videoTag]?.usage || 0;

            usageByDay[date][videoTag].usage = oldUsage + pendingUsage;
            const res = await sendMessageToBackground({
                type: "youtubeVideo",
                videoTag,
            });
            if (!res.success) {
                console.error("Failed to get video title from background script.");
                continue;
            }

            usageByDay[date][videoTag].title =
                res.data.type === "video" ? res.data.title : undefined;
            usageByDay[date][videoTag].thumbnailUrl =
                res.data.type === "video" ? res.data.thumbnailUrl : undefined;

            await setToLocalCache({ usageByDay });

            pendingUsage = 0;
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
