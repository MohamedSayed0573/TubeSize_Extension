import { createPageUsageObserver } from "@lib/pageUsageObserver";
import { defineContentScript } from "wxt/utils/define-content-script";

export default defineContentScript({
    matches: ["<all_urls>"],
    runAt: "document_start",
    allFrames: true,
    world: "MAIN",

    main() {
        createPageUsageObserver().install();
    },
});
