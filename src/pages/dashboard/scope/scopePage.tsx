import type { UsageScope } from "@app-types/types";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { getLastNDays } from "@lib/dateUtils";
import { formatDate } from "@lib/format";
import { parseScopeParam } from "@lib/routes";
import { getUsageNumber } from "@lib/usage";
import VideosTableSkeleton from "@pages/dashboard/platform/videosTableSkeleton";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams } from "react-router";

import { t } from "@/i18n/t";

import DashboardNotFound from "../shared/notFound";
import AllSitesTable from "./allSitesTable";
import PlatformCards from "./platformCards";

function getTitle(scope: UsageScope): string {
    if (scope.type === "range") {
        switch (scope.range) {
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
    }
    return formatDate(scope.date);
}

function ScopePageContent({ scope }: { scope: UsageScope }) {
    const { data: usage, isPending } = useSiteUsage(scope);

    if (isPending) return <VideosTableSkeleton />;

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

export default function ScopePage() {
    const { date } = useParams();
    const scope = parseScopeParam(date);

    if (!scope) return <DashboardNotFound />;

    return <ScopePageContent scope={scope} />;
}
