import { defineBackground } from "wxt/utils/define-background";
import { setupInstallCleanup } from "./installCleanup";
import { attachMessageHandler } from "./messageHandler";
import { setupTrackUsage } from "./usageTracker";

export default defineBackground(() => {
    attachMessageHandler();

    setupTrackUsage();

    setupInstallCleanup();
});
