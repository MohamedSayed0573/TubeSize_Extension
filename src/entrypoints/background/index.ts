import { defineBackground } from "wxt/utils/define-background";

import { setupBadgeRollover } from "./badgeRollover";
import { createDownloadDedup } from "./downloadDedup";
import { createDownloadTracker } from "./downloadTracker";
import { setupInstallCleanup } from "./installCleanup";
import { attachMessageHandler } from "./messageHandler";
import { createUsageIngestion } from "./usageIngestion";
import { setupTrackUsage } from "./usageTracker";

export default defineBackground(() => {
    const usageIngestion = createUsageIngestion();
    const downloadDedup = createDownloadDedup((tabUrl, bytes) => {
        usageIngestion.bufferTabUsage(tabUrl, bytes);
    });

    attachMessageHandler(usageIngestion);

    setupTrackUsage(usageIngestion, downloadDedup);
    createDownloadTracker(downloadDedup);

    setupInstallCleanup();

    setupBadgeRollover();
});
