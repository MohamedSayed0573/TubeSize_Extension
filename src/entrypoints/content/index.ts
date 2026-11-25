import { defineContentScript } from "wxt/utils/define-content-script";

import { initializeLanguage } from "@/i18n/language";
import { onMessage } from "@/messaging";

import { createContentSession } from "./contentSession";
import { getCurrentResolution } from "./resolution";

export default defineContentScript({
    matches: [
        "*://www.youtube.com/*",
        "*://youtube.com/*",
        "*://www.twitch.tv/*",
        "*://twitch.tv/*",
        "*://www.twitch.com/*",
        "*://twitch.com/*",
        "*://www.kick.com/*",
        "*://kick.com/*",
    ],
    runAt: "document_idle",
    allFrames: true,

    async main() {
        try {
            await initializeLanguage();
        } catch (err) {
            console.error("[content] Failed to initialize language; using browser default", err);
        }

        const session = createContentSession();
        void session.navigate();

        addEventListener("yt-navigate-finish", () => void session.navigate());

        onMessage("getCurrentResolution", () => getCurrentResolution());
    },
});
