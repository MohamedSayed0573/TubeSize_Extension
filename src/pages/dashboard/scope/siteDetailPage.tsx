import type { DateKey } from "@app-types/types";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { getSiteKey } from "@lib/domain";
import { typedEntries } from "@lib/utils";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import DashboardNotFound from "@pages/dashboard/shared/notFound";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams } from "react-router";

import DailyUsageTable from "./dailyUsageTable";

function SiteDetailContent({ siteName }: { siteName: string }) {
    const { data, isPending } = useSiteUsage();

    if (isPending) return;
    if (!data) return <NoUsageData />;

    const targetSite = getSiteKey(siteName);
    const dayToBytes: Map<DateKey, number> = new Map();
    data.forEach(({ day, usage }) => {
        const bytes = typedEntries(usage)
            .filter(([origin]) => getSiteKey(origin) === targetSite)
            .map(([, byteCount]) => byteCount)
            .reduce((sum, current) => sum + current, 0);

        dayToBytes.set(day, bytes);
    });

    const totalUsage = [...dayToBytes].reduce((sum, [, bytes]) => sum + bytes, 0);

    if (totalUsage === 0) {
        return (
            <>
                <DashboardHeader title={siteName} totalDataUsage={0} />
                <NoUsageData />
            </>
        );
    }

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

export default function SiteDetailPage() {
    const { siteName } = useParams();

    if (!siteName) return <DashboardNotFound />;

    return <SiteDetailContent siteName={siteName} />;
}
