import { formatDate, isValidDateKey } from "@lib/dashboardUtils";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import VideosTableSkeleton from "@pages/dashboard/platform/videosTableSkeleton";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { getLastNDays, getUsageNumber } from "@lib/dashboardUtils";
import { useParams } from "react-router";
import DashboardNotFound from "../shared/notFound";
import type { DateKey, UsageRange, UsageScope } from "@app-types/types";
import PlatformCards from "./platformCards";
import AllSitesTable from "./allSitesTable";

function getTitle(range: UsageScope): string {
    if (range.type === "range") {
        switch (range.range) {
            case "today": {
                return formatDate(getLastNDays(1));
            }
            case "week": {
                return formatDate(getLastNDays(7));
            }
            case "month": {
                return formatDate(getLastNDays(30));
            }
            case "lifetime": {
                return "Lifetime";
            }
        }
    } else {
        return formatDate(range.date);
    }
}

function getScope(date: DateKey | undefined): UsageScope | undefined {
    if (!date) return;

    if (["today", "week", "month", "lifetime"].includes(date)) {
        return {
            type: "range" as const,
            range: date as UsageRange,
        };
    }
    if (isValidDateKey(date)) {
        return {
            type: "date",
            date,
        };
    }
}

export function ScopePage() {
    const { date } = useParams();
    const scope = getScope(date as DateKey);

    const { data: usage, isPending, isError, error } = useSiteUsage(scope);

    if (!scope) return <DashboardNotFound />;
    if (isPending) return <VideosTableSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    return (
        <>
            <DashboardHeader title={getTitle(scope)} totalDataUsage={getUsageNumber(usage)} />
            <div className="flex flex-1 flex-col gap-1 bg-neutral-950/70 pt-1">
                <PlatformCards scope={scope} />
                <AllSitesTable usage={usage} />
            </div>
        </>
    );
}
