import { totalSizeVideoDisplay } from "@lib/formatting";
import { chromeNavigate, getSiteIconUrl } from "@lib/utils";
import { Calendar, ChevronLeft, ChevronRight, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";

function splitSize(formatted: string): { value: string; unit: string } {
    const [value, unit] = formatted.split(" ");
    return { value: value ?? "", unit: unit ?? "" };
}

interface PopupUsageProps {
    text: string;
    usage: number | undefined;
    navigateTo: string;
    variant?: "todayUsage" | "siteUsage";
    origin?: string;
}

export default function PopupUsage({ text, usage, navigateTo, variant, origin }: PopupUsageProps) {
    if (!usage) return;

    const formatted = totalSizeVideoDisplay(usage);
    const { value, unit } = splitSize(formatted);

    const content = (
        <>
            <span className={"flex size-7 items-center justify-center overflow-hidden rounded-md"}>
                <UsageIcon variant={variant} origin={origin} />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium text-zinc-400">{text}</span>
                <span>
                    <span className="text-[13px] font-semibold text-zinc-50">{value}</span>
                    <span className="ml-1 text-[11px] font-medium text-zinc-400">{unit}</span>
                </span>
            </span>
            <ArrowIcon />
        </>
    );

    return (
        <button
            type="button"
            onClick={() => chromeNavigate(navigateTo)}
            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-white/8 bg-white/4 px-3 py-2 text-start transition-all duration-150 hover:border-white/15 hover:bg-white/8"
        >
            {content}
        </button>
    );
}

function ArrowIcon() {
    const { i18n } = useTranslation();
    const lang = i18n.dir();

    const Icon = lang === "ltr" ? ChevronRight : ChevronLeft;
    return (
        <Icon className="size-4 text-zinc-600 transition-all duration-150 group-hover:translate-x-px group-hover:text-zinc-300" />
    );
}

function UsageIcon({ variant, origin }: { variant?: string; origin?: string }) {
    if (variant === "todayUsage")
        return (
            <div className="relative">
                <Calendar className="size-6.5" strokeWidth={2} />
                <span className="absolute inset-0 flex items-center justify-center pt-1.5 text-[11px] font-semibold">
                    {new Date().getDate()}
                </span>
            </div>
        );

    const siteIconUrl = getSiteIconUrl(origin);
    if (!siteIconUrl) return <Globe className="size-6.5" />;

    return (
        <div className="size-6.5">
            <img src={siteIconUrl} className="h-full w-full object-cover" />
        </div>
    );
}
