import { formatBytes, getLastNDays, getUsageNumber } from "@lib/dashboardUtils";
import { cn } from "@lib/utils";
import type { SiteUsage } from "@/db";
import { Activity, CalendarDays, CalendarRange, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";

function StatsCard({
    title,
    value,
    icon: Icon,
    accentClass,
}: {
    title: string;
    value: string;
    icon: LucideIcon;
    accentClass: string;
}) {
    const { t } = useTranslation();
    return (
        <div className="flex flex-col justify-center gap-2.5 rounded-lg border border-white/8 bg-[#1d1d1d] py-4 pr-2.5 pl-5.5 hover:cursor-pointer hover:bg-neutral-800">
            <div className="flex items-center gap-2 font-mono text-sm font-semibold text-teal-400 uppercase">
                <span
                    className={cn(
                        "flex size-6 items-center justify-center rounded-md",
                        accentClass,
                    )}
                >
                    <Icon className="size-3.5" />
                </span>
                {t(`dashboard.${title}`)}
            </div>
            <div className="flex justify-between font-mono text-2xl font-bold text-stone-200">
                {value}
                <div className="flex items-end font-mono text-xs text-teal-600 underline">
                    {t("dashboard.viewDetails")}
                </div>
            </div>
        </div>
    );
}

export function StatsRow({ usage }: { usage: SiteUsage[] }) {
    const todayUsage = usage.find((u) => getLastNDays(1).includes(u.day));
    const last7DaysUsage = usage.filter((u) => getLastNDays(7).includes(u.day));
    const last30DaysUsage = usage.filter((u) => getLastNDays(30).includes(u.day));

    const cards = [
        {
            to: `/dashboard/today`,
            title: "today",
            value: formatBytes(todayUsage ? getUsageNumber([todayUsage]) : 0),
            icon: CalendarDays,
            accentClass: "bg-sky-500/10 text-sky-400",
        },
        {
            to: `/dashboard/week`,
            title: "week",
            value: formatBytes(getUsageNumber(last7DaysUsage)),
            icon: CalendarRange,
            accentClass: "bg-emerald-500/10 text-emerald-400",
        },
        {
            to: `/dashboard/month`,
            title: "month",
            value: formatBytes(getUsageNumber(last30DaysUsage)),
            icon: Activity,
            accentClass: "bg-violet-500/10 text-violet-400",
        },
        {
            to: `/dashboard/lifetime`,
            title: "lifetime",
            value: formatBytes(getUsageNumber(usage)),
            icon: Database,
            accentClass: "bg-amber-500/10 text-amber-400",
        },
    ];

    return (
        <div className="grid grid-cols-4 gap-2 py-2.5">
            {cards.map((card) => (
                <Link to={card.to} key={card.title}>
                    <StatsCard {...card} />
                </Link>
            ))}
        </div>
    );
}
