import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams } from "react-router";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { getOriginWithoutSuffix } from "@lib/dashboardUtils";
import DailyUsageTable from "./dailyUsageTable";

export function SiteDetailPage() {
    const { siteName } = useParams();
    const { data, isPending, isError, error } = useSiteUsage();

    if (!siteName) return;
    if (isPending) return;
    if (isError) throw error;
    if (!data) return <NoUsageData />;

    const dayToBytes: Map<string, number> = new Map();
    data.forEach(({ day, usage }) => {
        const bytes = Object.entries(usage)
            .filter(([origin]) => getOriginWithoutSuffix(origin) === siteName)
            .map(([, bytes]) => bytes)
            .reduce((sum, current) => sum + current, 0);

        dayToBytes.set(day, bytes);
    });

    const totalUsage = [...dayToBytes].reduce((sum, [, bytes]) => sum + bytes, 0);

    const sortedUsage = Array.from(dayToBytes)
        .filter(([, bytes]) => bytes > 0)
        .toSorted(([, a], [, b]) => b - a)
        .map(([day, bytes]) => {
            return { day, bytes };
        });

    return (
        <>
            <DashboardHeader title={siteName} totalDataUsage={totalUsage} />
            <div className="flex flex-1 flex-col gap-1 bg-neutral-950/70 pt-1">
                <DailyUsageTable usage={sortedUsage} totalUsage={totalUsage} />
            </div>
        </>
    );
}
