import { setToLocalCache } from "@lib/cache";
import { delay, extractVideoTag } from "@lib/utils";
import { getUsageByDay } from "@lib/analyticsUtils";

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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
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
        usageByDay[date][videoTag] = {
            usage: oldUsage + pendingUsage,
        };

        await setToLocalCache({ usageByDay });

        pendingUsage = 0;
        await delay(10_000);
    }
})().catch((err) => {
    console.error("Error in usage tracking loop:", err);
});

observer.observe({
    type: "resource",
    buffered: true,
});
