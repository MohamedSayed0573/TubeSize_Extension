import { AlertDestructive } from "@components/alertDestructive";
import { useSiteUsage } from "@hooks/useSiteUsage";
import type { InvalidImportJson } from "@lib/errors";
import { useState } from "react";

import { UsageChartSection } from "./chartSection";
import DashboardBanner from "./dashboardBanner";
import { DashboardSkeleton } from "./dashboardSkeleton";
import { FooterBtns } from "./footerBtns";
import { StatsRow } from "./statsRow";

export default function Dashboard({ chart }: { chart: "daily" | "sites" }) {
    const { data: usage, isPending, isError, error } = useSiteUsage();
    const [btnError, setError] = useState<InvalidImportJson>();

    if (isPending) return <DashboardSkeleton />;
    if (isError) throw error;

    return (
        <>
            {btnError && (
                <AlertDestructive title={btnError.message} onClose={() => setError(undefined)} />
            )}
            <DashboardBanner />
            <div className="flex flex-1 flex-col bg-neutral-950/70 px-6 pt-1 pb-3.5">
                <StatsRow usage={usage ?? []} />
                <UsageChartSection chart={chart} usage={usage} />
                <FooterBtns setError={setError} />
            </div>
        </>
    );
}
