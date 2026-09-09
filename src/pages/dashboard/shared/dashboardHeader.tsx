import { formatBytes } from "@lib/dashboardUtils";
import { ArrowLeft } from "lucide-react";
import ButtonLink from "@components/buttonLink";

interface DashboardHeaderProps {
    title: string;
    totalDataUsage: number;
}

export default function DashboardHeader({ title, totalDataUsage }: DashboardHeaderProps) {
    const formattedDataUsage = formatBytes(totalDataUsage);

    return (
        <div className="flex items-center justify-between gap-5 border-b border-neutral-800 bg-neutral-900 px-4 py-3">
            <div className="flex flex-1 items-center justify-start">
                <ButtonLink to="/dashboard" variant={"outline"} size={"lg"} className="font-mono">
                    <ArrowLeft className="size-4" />
                    Back to Dashboard
                </ButtonLink>
            </div>

            <div className="flex flex-1 items-center justify-center truncate font-mono text-lg font-bold text-stone-100">
                {title}
            </div>

            <div className="flex flex-1 items-center justify-end pr-4">
                <div className="flex flex-col items-center gap-1">
                    <span className="font-mono text-[0.65rem] font-semibold tracking-wider text-teal-400 uppercase">
                        Total Data Used
                    </span>
                    <span className="font-mono text-lg font-bold text-stone-100">
                        {formattedDataUsage}
                    </span>
                </div>
            </div>
        </div>
    );
}
