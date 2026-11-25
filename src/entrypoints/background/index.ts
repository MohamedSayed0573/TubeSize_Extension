import { defineBackground } from "wxt/utils/define-background";

import { setupInstallCleanup } from "./installCleanup";
import { attachMessageHandler } from "./messageHandler";
import { createUsageIngestion } from "./usageIngestion";
import { setupTrackUsage } from "./usageTracker";

export default defineBackground(() => {
    const usageIngestion = createUsageIngestion();

    attachMessageHandler(usageIngestion);

    setupTrackUsage(usageIngestion);

    setupInstallCleanup();
});
