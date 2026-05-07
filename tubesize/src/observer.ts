import { getFromLocalCache, setToLocalCache } from "@lib/cache";
import { delay } from "@lib/utils";

let sessionUsage: number = 0;
let pendingUsage: number = 0;
let lastCurrentUrl: string | undefined;

export async function getUsageByDay() {
    return ((await getFromLocalCache("usageByDay")) ?? {}) as Record<string, number>;
}

const observer = new PerformanceObserver((list) => {
    if (globalThis.location.href !== lastCurrentUrl) {
        // URL has changed, reset session usage
        sessionUsage = 0;
        lastCurrentUrl = globalThis.location.href;
    }
    for (const entry of list.getEntries()) {
        const resource = entry as PerformanceResourceTiming;
        sessionUsage += resource.transferSize;
        pendingUsage += resource.transferSize;
    }
});

void (async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
        const date = new Date().toISOString().split("T")[0];
        const usageByDay = await getUsageByDay();
        usageByDay[date] = (usageByDay[date] ?? 0) + pendingUsage;
        await setToLocalCache({ usageByDay });

        pendingUsage = 0;
        await delay(10_000);
    }
})();

observer.observe({
    type: "resource",
    buffered: true,
});

chrome.runtime.onMessage.addListener(
    (
        message: { type: "sessionUsage" | "deleteSessionData" | "deleteTotalData" },
        _sender,
        sendResponse,
    ) => {
        switch (message.type) {
            case "sessionUsage": {
                sendResponse(sessionUsage);
                break;
            }
            case "deleteSessionData": {
                sessionUsage = 0;
                pendingUsage = 0;
                sendResponse({ success: true });
                break;
            }
            case "deleteTotalData": {
                void (async () => {
                    await setToLocalCache({ totalUsage: 0 });
                })();
                sendResponse({ success: true });
            }
        }
        return true;
    },
);
