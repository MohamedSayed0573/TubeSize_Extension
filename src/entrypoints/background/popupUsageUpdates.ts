import { POPUP_USAGE_UPDATED_MESSAGE } from "@app-types/types";

/**
 * Notify an open popup that its cached usage summary is stale.
 */
export function notifyPopupUsageUpdated() {
    const message = { type: POPUP_USAGE_UPDATED_MESSAGE };
    void chrome.runtime.sendMessage(message).catch(() => {});
}
