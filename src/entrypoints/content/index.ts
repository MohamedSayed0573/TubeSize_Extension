import { PLATFORM_MATCH_PATTERNS } from "@lib/platformUrl";
import { defineContentScript } from "wxt/utils/define-content-script";

import { initializeLanguage } from "@/i18n/language";
import { onTabMessage } from "@/messaging";

import { createContentSession, isSamePageNavigation } from "./contentSession";
import { getCurrentResolution } from "./resolution";

export default defineContentScript({
    matches: PLATFORM_MATCH_PATTERNS,
    runAt: "document_idle",
    allFrames: true,

    async main(ctx) {
        try {
            await initializeLanguage();
        } catch (err) {
            console.error("[content] Failed to initialize language; using browser default", err);
        }

        if (ctx.isInvalid) return;

        const session = createContentSession();
        ctx.onInvalidated(() => session.dispose());
        void session.navigate();

        ctx.addEventListener(window, "wxt:locationchange", ({ oldUrl, newUrl }) => {
            if (isSamePageNavigation(oldUrl, newUrl)) return;
            void session.navigate(newUrl.href);
        });

        ctx.onInvalidated(onTabMessage("getCurrentResolution", () => getCurrentResolution()));
    },
});
