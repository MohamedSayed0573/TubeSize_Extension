import type { Origin } from "@app-types/types";
import useTab from "@hooks/useTab";
import { useTodayUsageSummary } from "@hooks/useUsage";
import { getSiteKey, getSiteLabel, toOrigin } from "@lib/domain";
import { buildRangePath, buildSitePath } from "@lib/routes";

import { t } from "@/i18n/t";

import { PopupFooter } from "./popupFooter";
import PopupUsage from "./popupUsage";

function getTabOrigin(tabUrl: string | undefined): Origin | undefined {
    if (!tabUrl) return;

    try {
        const url = new URL(tabUrl);
        return url.protocol === "http:" || url.protocol === "https:"
            ? toOrigin(url.origin)
            : undefined;
    } catch {
        return;
    }
}

export function PopupViewContainer({ children }: { children: React.ReactNode }) {
    const { data: tab } = useTab();
    const origin = getTabOrigin(tab?.tabUrl);
    const siteKey = origin ? getSiteKey(origin) : undefined;

    const { data: todayUsage } = useTodayUsageSummary(siteKey);

    return (
        <div className="flex flex-col gap-2 px-3 py-2 text-xs text-zinc-400">
            <div className="flex flex-col gap-1.5">
                <PopupUsage
                    text={t("popup_totalUsageToday")}
                    usage={todayUsage?.totalBytes}
                    navigateTo={{ page: "dashboard", path: buildRangePath("today") }}
                    variant="todayUsage"
                />

                {origin && siteKey && (
                    <PopupUsage
                        text={t("popup_siteUsage", [getSiteLabel(origin)])}
                        usage={todayUsage?.siteBytes}
                        navigateTo={{ page: "dashboard", path: buildSitePath(siteKey) }}
                        variant="siteUsage"
                        origin={origin}
                    />
                )}
            </div>

            {children}

            <PopupFooter />
        </div>
    );
}
