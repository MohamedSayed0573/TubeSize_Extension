import { syncAppLang } from "@/i18n/i18n";
import { defineContentScript } from "wxt/utils/define-content-script";
import { setupMessageHandler } from "./messageHandler";
import { handlePageNavigation } from "./pageNavigation";

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
    runAt: "document_start",
    allFrames: true,

    main() {
        void syncAppLang();

        void handlePageNavigation();

        setupMessageHandler();
    },
});
