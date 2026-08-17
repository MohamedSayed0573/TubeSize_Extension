import {
    getNumVideosWatched,
    getUsageNumber,
    getUsageByDate,
    formatDate,
} from "@lib/analyticsUtils";
import { useParams } from "react-router";
import AnalyticsHeader from "./analyticsHeader";
import AnalyticsBody from "./analyticsBody";
import useUsage from "@/hooks/useUsage";

export function UsageDetails() {
    const { usage, error } = useUsage();
    const { date } = useParams();
    if (!date) return;

    const daysUsage = getUsageByDate(usage, date);

    return (
        <>
            <AnalyticsHeader
                numVideosWatched={getNumVideosWatched(daysUsage)}
                title={formatDate(new Date(date))}
                totalDataUsage={getUsageNumber(daysUsage)}
                key={date}
            />
            <AnalyticsBody usage={daysUsage} error={error} />
        </>
    );
}
