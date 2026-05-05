import { getFromLocalCache, setToLocalCache } from "@lib/cache";

let sessionUsage: number = 0;
let pendingUsage: number = 0;
let lastCurrentUrl: string | undefined;

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
        const totalUsage = (await getTotalUsage()) ?? 0;
        await setToLocalCache({ totalUsage: totalUsage + pendingUsage });
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
        message: { type: "totalUsage" | "deleteSessionData" | "deleteTotalData" },
        _sender,
        sendResponse,
    ) => {
        switch (message.type) {
            case "totalUsage": {
                void (async () => {
                    const totalUsage = (await getTotalUsage()) ?? 0;
                    sendResponse({ sessionUsage, totalUsage });
                })();
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
                });
                sendResponse({ success: true });
            }
        }
    },
);

async function getTotalUsage() {
    return getFromLocalCache("totalUsage") as Promise<number | undefined>;
}

async function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
