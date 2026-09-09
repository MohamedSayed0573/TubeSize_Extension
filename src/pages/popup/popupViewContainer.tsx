import { useTotalUsage } from "@hooks/useTotalUsage";
import { useOriginUsage } from "@hooks/useOriginUsage";
import useTab from "@hooks/useTab";
import PopupUsage from "./popupUsage";
import { getOriginWithoutSuffix } from "@lib/dashboardUtils";

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
    const { data: tab } = useTab();
    const origin = getTabOrigin(tab?.tabUrl);

    const totalUsage = useTotalUsage();
    const originUsage = useOriginUsage(origin);

    return (
        <div className="flex flex-col gap-2 px-3 py-2 text-xs text-zinc-400">
            <div className="flex flex-col gap-1.5">
                <PopupUsage
                    text="Total Usage Today"
                    usage={totalUsage}
                    navigateTo="dashboard/today"
                    variant="todayUsage"
                />

                {origin && (
                    <PopupUsage
                        text={`${getOriginWithoutSuffix(origin)} Usage`}
                        usage={originUsage}
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
