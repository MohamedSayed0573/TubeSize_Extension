import type { UsageMessage } from "@app-types/types";

const _fetch = fetch;
// eslint-disable-next-line @typescript-eslint/unbound-method
const _xhrSend = XMLHttpRequest.prototype.send;

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

XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    this.addEventListener(
        "loadend",
        () => {
            let bytes = 0;

            try {
                const responseType = this.responseType;

                if (responseType === "arraybuffer") {
                    bytes = (this.response as ArrayBuffer).byteLength;
                } else if (responseType === "blob") {
                    bytes = (this.response as Blob).size;
                } else if (responseType === "" || responseType === "text") {
                    bytes = new TextEncoder().encode(this.responseText).length;
                } else if (responseType === "json") {
                    bytes = new TextEncoder().encode(JSON.stringify(this.response)).length;
                }
            } catch {}

            total += bytes;
        },
        { once: true },
    );

    return _xhrSend.call(this, body);
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
