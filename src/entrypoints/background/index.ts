import { defineBackground } from "wxt/utils/define-background";

import { setupBadgeRollover } from "./badgeRollover";
import { createDownloadDeduplicator } from "./downloadDedup";
import { createDownloadTracker } from "./downloadTracker";
import { setupInstallCleanup } from "./installCleanup";
import { attachMessageHandler } from "./messageHandler";
import { createUsageIngestion } from "./usageIngestion";
import { setupTrackUsage } from "./usageTracker";

export default defineBackground(() => {
    const usageIngestion = createUsageIngestion();
    const downloadDeduplicator = createDownloadDeduplicator();

    attachMessageHandler(usageIngestion);

    setupTrackUsage(usageIngestion, downloadDeduplicator);
    createDownloadTracker(usageIngestion, downloadDeduplicator);

    setupInstallCleanup();

    setupBadgeRollover();
});
