import { t } from "@/i18n/t";
import { formatBytes } from "@lib/format";
import { ArrowLeft } from "lucide-react";
import ButtonLink from "@components/buttonLink";

interface DashboardHeaderProps {
    title: string;
    totalDataUsage: number;
}

export default function DashboardHeader({ title, totalDataUsage }: DashboardHeaderProps) {
    const formattedDataUsage = formatBytes(totalDataUsage);

    return (
        <div className="flex items-center border-b border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex items-center justify-start">
                <ButtonLink to="/daily" variant={"outline"} size={"lg"} className="font-mono">
                    <ArrowLeft className="size-4 rtl:rotate-180" />
                    {t("common_backToDashboard")}
                </ButtonLink>
            </div>

            <div className="flex flex-1 items-center justify-center truncate font-mono text-lg font-bold text-stone-100">
                {title}
            </div>

            <div className="flex items-center justify-end pr-4">
                <div className="flex flex-col items-center gap-1">
                    <span className="font-mono text-[0.65rem] font-semibold tracking-wider text-teal-400 uppercase">
                        {t("dashboard_totalDataUsed")}
                    </span>
                    <span className="font-mono text-lg font-bold text-stone-100">
                        {formattedDataUsage}
                    </span>
                </div>
            </div>
        </div>
    );
}
