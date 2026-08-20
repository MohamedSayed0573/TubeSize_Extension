import {
    getNumVideosWatched,
    getUsageNumber,
    getUsageByDate,
    formatDate,
} from "@lib/analyticsUtils";
import { useParams } from "react-router";
import AnalyticsHeader from "@pages/analytics/analyticsHeader";
import AnalyticsBody from "@pages/analytics/analyticsBody";
import useUsage from "@/hooks/useUsage";

export function UsageDetails() {
    const { query } = useUsage();
    const { data: usage, isPending, isError } = query;
    const { date } = useParams();

    if (!date) return;
    if (isPending) return <div>Loading...</div>;
    if (isError) return <div>Error loading usage.</div>;
    if (!usage) return <div>No usage data available.</div>;

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
