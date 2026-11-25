import type { PlatformId, UsageScope } from "@app-types/types";
import { usePlatformWatchReport } from "@hooks/useUsage";
import { formatDate } from "@lib/format";
import { getPlatformDisplayName, isPlatformId } from "@lib/platformUrl";
import { parseScopeSearch } from "@lib/routes";
import DashboardHeader from "@pages/dashboard/shared/dashboardHeader";
import NoUsageData from "@pages/dashboard/shared/noUsageData";
import { useParams, useSearchParams } from "react-router";

import { t, tPlural } from "@/i18n/t";

import DashboardNotFound from "../shared/notFound";
import { PlatformLogo } from "./platformLogos";
import VideosTable from "./videosTable";
import VideosTableSkeleton from "./videosTableSkeleton";

function PlatformUsageContent({ platform, scope }: { platform: PlatformId; scope: UsageScope }) {
    const { data: rows, isPending } = usePlatformWatchReport(platform, scope);

    if (isPending) return <VideosTableSkeleton />;

    const totalDataUsage = rows.reduce((sum, current) => sum + current.usage, 0);
    const label = getPlatformDisplayName(platform);

    return (
        <>
            <DashboardHeader title={getTitle(scope, platform)} totalDataUsage={totalDataUsage} />
            <div className="flex flex-1 flex-col bg-neutral-950 p-8">
                <div className="mb-4 flex flex-wrap items-center gap-4">
                    <PlatformLogo platform={platform} />
                    <h2 className="font-mono text-xl font-bold text-stone-100">{label}</h2>
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-teal-900/60 bg-teal-950/40 px-3 py-1 font-mono text-xs font-medium text-teal-400">
                            {getScopeLabel(scope)}
                        </span>
                        <span className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 font-mono text-xs text-stone-400">
                            {rows.length === 0
                                ? t("dashboard_noVideos")
                                : tPlural("dashboard_videosCount", rows.length, [rows.length])}
                        </span>
                    </div>
                </div>

                <div className="flex flex-1 flex-col rounded-2xl border border-neutral-800 bg-neutral-900">
                    {rows.length === 0 ? (
                        <NoUsageData />
                    ) : (
                        <VideosTable rows={rows} platform={platform} />
                    )}
                </div>
            </div>
        </>
    );
}

export default function PlatformUsage() {
    const { platformId } = useParams();
    const [searchParams] = useSearchParams();

    if (!platformId || !isPlatformId(platformId)) {
        return <DashboardNotFound />;
    }

    const scope = parseScopeSearch(searchParams);
    return <PlatformUsageContent platform={platformId} scope={scope} />;
}

function getScopeLabel(scope: UsageScope): string {
    if (scope.type === "date") return formatDate(scope.date);

    switch (scope.range) {
        case "today": {
            return t("dashboard_today");
        }
        case "week": {
            return t("dashboard_week");
        }
        case "month": {
            return t("dashboard_month");
        }
        case "lifetime": {
            return t("dashboard_lifetime");
        }
    }
}

function getTitle(scope: UsageScope, platform: PlatformId) {
    const label = getPlatformDisplayName(platform);
    if (scope.type === "range") {
        if (scope.range === "today") return t("dashboard_titleOnPlatformToday", [label]);
        if (scope.range === "week") return t("dashboard_titleOnPlatformWeek", [label]);
        if (scope.range === "month") return t("dashboard_titleOnPlatformMonth", [label]);
        return t("dashboard_titleOnPlatformLifetime", [label]);
    }

    return t("dashboard_titleOnPlatformDate", [scope.date, label]);
}
