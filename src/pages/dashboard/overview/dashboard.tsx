import { DashboardSkeleton } from "./dashboardSkeleton";
import DashboardBanner from "./dashboardBanner";
import NoUsageData from "../shared/noUsageData";
import { useSiteUsage } from "@hooks/useSiteUsage";
import { StatsRow } from "./statsRow";
import { UsageChartSection } from "./chartSection";
import { FooterBtns } from "./footerBtns";

export default function Dashboard({ chart }: { chart: "daily" | "sites" }) {
    const { data: usage, isPending, isError, error } = useSiteUsage();

    if (isPending) return <DashboardSkeleton />;
    if (isError) throw error;
    if (!usage) return <NoUsageData />;

    return (
        <>
            <DashboardBanner />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-6 pt-1 pb-3.5">
                <StatsRow usage={usage} />
                <UsageChartSection chart={chart} usage={usage} />
                <FooterBtns />
            </div>
        </>
    );
}
