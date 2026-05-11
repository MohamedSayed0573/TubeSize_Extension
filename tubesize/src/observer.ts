import { setToLocalCache } from "@lib/cache";
import { delay, extractVideoTag } from "@lib/utils";
import { getUsageByDay } from "@lib/analyticsUtils";
import { sendMessageToBackground } from "./runtime";

let pendingUsage: number = 0;
const observer = new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        console.log(resource);
        pendingUsage += resource.transferSize;
    }
});

function getCurrentTabUrl() {
    return globalThis.location.href;
}

void (async () => {
    let firstRun = true;
    do {
        const videoTag = extractVideoTag(getCurrentTabUrl());
        if (!videoTag) {
            await delay(10_000);
            continue;
        }

        const date = new Date().toISOString().split("T")[0];
        const usageByDay = await getUsageByDay();

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        const oldUsage = usageByDay?.[date]?.[videoTag]?.usage || 0;

        usageByDay[date] ??= {};
        if (firstRun) {
            const res = await sendMessageToBackground({
                type: "youtubeVideo",
                videoTag,
                html: document.documentElement.outerHTML,
            });
            if (!res.success) {
                console.error("Failed to get video title from background script.");
                firstRun = false;
                continue;
            }
            usageByDay[date][videoTag] = {
                usage: oldUsage + pendingUsage,
                title: res.data.type === "video" ? res.data.title : undefined,
                thumbnailUrl: res.data.type === "video" ? res.data.thumbnailUrl : undefined,
            };
            firstRun = false;
            console.log("Initial usage recorded:", usageByDay[date][videoTag]);
        } else {
            usageByDay[date][videoTag].usage = oldUsage + pendingUsage;
        }

        await setToLocalCache({ usageByDay });

        pendingUsage = 0;
        await delay(10_000);
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition , no-constant-condition
    } while (true);
})().catch((err) => {
    console.error("Error in usage tracking loop:", err);
});

observer.observe({
    type: "resource",
    buffered: true,
});
