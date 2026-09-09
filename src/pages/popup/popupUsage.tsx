import { totalSizeVideoDisplay } from "@lib/formatting";
import { chromeNavigate, cn } from "@lib/utils";
import { CalendarDays, ChevronRight, Globe } from "lucide-react";

function splitSize(formatted: string): { value: string; unit: string } {
    const [value, unit] = formatted.split(" ");
    return { value: value ?? "", unit: unit ?? "" };
}

export default function PopupUsage({
    text,
    usage,
    navigateTo,
    variant,
}: {
    text: string;
    usage: number | undefined;
    navigateTo: string;
    variant: "todayUsage" | "siteUsage";
}) {
    if (usage === undefined) return null;

    const Icon = variant === "todayUsage" ? CalendarDays : Globe;
    const formatted = totalSizeVideoDisplay(usage);
    const { value, unit } = splitSize(formatted);

    const content = (
        <>
            <span
                className={cn(
                    "flex size-8 items-center justify-center rounded-md border",
                    variant === "todayUsage"
                        ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-300"
                        : "border-sky-400/20 bg-sky-400/10 text-sky-300",
                )}
            >
                <Icon className="size-4" strokeWidth={2} />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium text-zinc-400">{text}</span>
                <span>
                    <span className="text-[13px] font-semibold text-zinc-50">{value}</span>
                    <span className="ml-1 text-[11px] font-medium text-zinc-400">{unit}</span>
                </span>
            </span>
            <ChevronRight className="size-4 text-zinc-600 transition-all duration-150 group-hover:translate-x-px group-hover:text-zinc-300" />
        </>
    );

    return (
        <button
            type="button"
            onClick={() => chromeNavigate(navigateTo)}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-white/8 bg-white/4 px-2.5 py-2 text-left transition-all duration-150 hover:border-white/15 hover:bg-white/8"
        >
            {content}
        </button>
    );
}
