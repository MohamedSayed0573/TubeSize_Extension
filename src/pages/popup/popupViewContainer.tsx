import { usePopupUsage } from "@hooks/usePopupUsage";
import useTab from "@hooks/useTab";
import PopupUsage from "./popupUsage";
import { getOriginWithoutSuffix } from "@lib/dashboardUtils";
import { useTranslation } from "react-i18next";

function getTabOrigin(tabUrl: string | undefined) {
    if (!tabUrl) return;

    try {
        const url = new URL(tabUrl);
        return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
    } catch {
        return;
    }
}

export function PopupViewContainer({ children }: { children: React.ReactNode }) {
    const { t } = useTranslation();
    const { data: tab } = useTab();
    const origin = getTabOrigin(tab?.tabUrl);

    const { data: usage } = usePopupUsage(origin);

    return (
        <div className="flex flex-col gap-2 px-3 py-2 text-xs text-zinc-400">
            <div className="flex flex-col gap-1.5">
                <PopupUsage
                    text={t("popup.totalUsageToday")}
                    usage={usage?.total}
                    navigateTo="dashboard/today"
                    variant="todayUsage"
                />

                {origin && (
                    <PopupUsage
                        text={t("popup.siteUsage", {
                            origin: getOriginWithoutSuffix(origin),
                        })}
                        usage={usage?.originUsage}
                        navigateTo={`dashboard/site/${getOriginWithoutSuffix(origin)}`}
                        variant="siteUsage"
                        origin={origin}
                    />
                )}
            </div>

            {children}
        </div>
    );
}
