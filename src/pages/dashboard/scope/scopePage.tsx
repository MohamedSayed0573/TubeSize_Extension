import type { UsageRange, UsageScope } from "@app-types/types";
import { useSiteUsage } from "@hooks/useSiteUsage";
import CONFIG from "@lib/constants";
import { getLastNDays, isValidDateKey } from "@lib/dateUtils";
import { formatDate } from "@lib/format";
import { getUsageNumber } from "@lib/usage";
import VideosTableSkeleton from "@pages/dashboard/platform/videosTableSkeleton";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams } from "react-router";

import { t } from "@/i18n/t";

import DashboardNotFound from "../shared/notFound";
import AllSitesTable from "./allSitesTable";
import PlatformCards from "./platformCards";

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
                return t("dashboard_lifetime");
            }
        }
    } else {
        return formatDate(range.date);
    }
}

function isUsageRange(value: string): value is UsageRange {
    // eslint-disable-next-line unicorn/prefer-includes
    return CONFIG.RANGES.some((range) => range === value);
}

function getScope(param: string | undefined): UsageScope | undefined {
    if (!param) return;

    if (isUsageRange(param)) {
        return {
            type: "range",
            range: param,
        };
    }
    if (isValidDateKey(param)) {
        return {
            type: "date",
            date: param,
        };
    }
}

export default function ScopePage() {
    const { date } = useParams();
    const scope = getScope(date);

    const { data: usage, isPending, isError, error } = useSiteUsage(scope);

    if (!scope) return <DashboardNotFound />;
    if (isPending) return <VideosTableSkeleton />;
    if (isError) throw error;

    if (!usage || usage.length === 0)
        return (
            <>
                <DashboardHeader title={getTitle(scope)} totalDataUsage={0} />
                <NoUsageData />
            </>
        );

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
