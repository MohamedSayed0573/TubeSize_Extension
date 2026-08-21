import {
    getNumVideosWatched,
    getUsageNumber,
    getUsageByDate,
    formatDate,
} from "@lib/analyticsUtils";
import { useParams } from "react-router";
import AnalyticsHeader from "@pages/analytics/components/analyticsHeader";
import AnalyticsBody from "@pages/analytics/components/analyticsBody";
import NoUsageData from "@pages/analytics/components/noUsageData";
import UsageDetailsSkeleton from "@pages/analytics/components/usageDetailsSkeleton";
import useUsage from "@hooks/useUsage";

export function UsageDetails() {
    const { query } = useUsage();
    const { data: usage, isPending, isError, error } = query;
    const { date } = useParams();

    if (!date) return;
    if (isPending) return <UsageDetailsSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    const daysUsage = getUsageByDate(usage, date);

    return (
        <>
            <AnalyticsHeader
                numVideosWatched={getNumVideosWatched(daysUsage)}
                title={formatDate(new Date(date))}
                totalDataUsage={getUsageNumber(daysUsage)}
                key={date}
            />
            <AnalyticsBody usage={daysUsage} />
        </>
    );
}
