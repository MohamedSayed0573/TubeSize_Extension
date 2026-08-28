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
