import type { UsageMessage } from "@app-types/types";

const _fetch = fetch;

let total = 0;
// eslint-disable-next-line unicorn/no-global-object-property-assignment
globalThis.fetch = async (...args) => {
    const response = await _fetch(...args);

    const clone = response.clone();

    let bytes = 0;
    void (async () => {
        const reader = clone.body?.getReader();
        if (!reader) return;

        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
        }
        total += bytes;
    })().catch((err) => console.log(err));

    return response;
};

let totalObserver = 0;
let counterObserver = 0;
const observer = new PerformanceObserver((entries, _) => {
    const _entries = entries.getEntries();
    for (const entry of _entries) {
        const resource = entry as PerformanceResourceTiming & {
            deliveryType: "cache" | "cache-storage" | "";
        };

        if (resource.initiatorType === "fetch") continue; // We already monkey-patch the fetch function
        if (resource.deliveryType === "cache" || resource.deliveryType === "cache-storage")
            continue;

        totalObserver += resource.transferSize;
        counterObserver += 1;
        console.log(resource, counterObserver);
    }
});
observer.observe({ type: "resource", buffered: true });

setInterval(() => {
    console.log(totalObserver, counterObserver);
}, 7000);

setInterval(() => {
    window.postMessage(
        {
            type: "TUBESIZE_USAGE",
            bytes: total,
        } satisfies UsageMessage,
        "*",
    );
    console.log(`We have used ${total}`);
    total = 0;
}, 10_000);
