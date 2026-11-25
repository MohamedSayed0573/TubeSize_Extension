import { getNextLocalMidnightMs } from "@lib/dateUtils";

import { refreshUsageBadge } from "@/badge";

export const MIDNIGHT_BADGE_ALARM = "tubesize-midnight-badge-rollover";

export interface BadgeRolloverDeps {
    refreshBadge?: () => Promise<void>;
    now?: () => Date;
}

export async function scheduleMidnightBadgeRollover(now: Date = new Date()): Promise<number> {
    const when = getNextLocalMidnightMs(now);
    await chrome.alarms.create(MIDNIGHT_BADGE_ALARM, { when });
    return when;
}

export function setupBadgeRollover(deps: BadgeRolloverDeps = {}): () => void {
    const refreshBadge = deps.refreshBadge ?? refreshUsageBadge;
    const now = deps.now ?? (() => new Date());

    async function syncBadgeAndSchedule() {
        try {
            await refreshBadge();
        } catch (err) {
            console.error("Failed to refresh usage badge:", err);
        }

        try {
            await scheduleMidnightBadgeRollover(now());
        } catch (err) {
            console.error("Failed to schedule midnight badge rollover:", err);
        }
    }

    const onStartup = () => {
        void syncBadgeAndSchedule();
    };

    const onInstalled = () => {
        void syncBadgeAndSchedule();
    };

    const onAlarm = (alarm: chrome.alarms.Alarm) => {
        if (alarm.name !== MIDNIGHT_BADGE_ALARM) return;
        void syncBadgeAndSchedule();
    };

    chrome.runtime.onStartup.addListener(onStartup);
    chrome.runtime.onInstalled.addListener(onInstalled);
    chrome.alarms.onAlarm.addListener(onAlarm);

    return () => {
        chrome.runtime.onStartup.removeListener(onStartup);
        chrome.runtime.onInstalled.removeListener(onInstalled);
        chrome.alarms.onAlarm.removeListener(onAlarm);
    };
}
