import { useSiteDailyUsage } from "@hooks/useUsage";
import { getSiteKey } from "@lib/domain";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import DashboardNotFound from "@pages/dashboard/shared/notFound";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams } from "react-router";

import DailyUsageTable from "./dailyUsageTable";

function SiteDetailContent({ siteName }: { siteName: string }) {
    const targetSite = getSiteKey(siteName);
    const { data: report, isPending } = useSiteDailyUsage(targetSite);

    if (isPending) return;

    if (report.totalBytes === 0) {
        return (
            <>
                <DashboardHeader title={siteName} totalDataUsage={0} />
                <NoUsageData />
            </>
        );
    }

    return (
        <>
            <DashboardHeader title={siteName} totalDataUsage={report.totalBytes} />
            <div className="flex flex-1 flex-col gap-1 bg-neutral-950/70 pt-1">
                <DailyUsageTable usage={report.days} totalUsage={report.totalBytes} />
            </div>
        </>
    );
}

export default function SiteDetailPage() {
    const { siteName } = useParams();

    if (!siteName) return <DashboardNotFound />;

    return <SiteDetailContent siteName={siteName} />;
}
