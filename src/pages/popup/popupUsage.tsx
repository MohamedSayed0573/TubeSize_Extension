import SiteIcon from "@components/siteIcon";
import { totalSizeVideoDisplay } from "@lib/formatting";
import { chromeNavigate, isFirefox } from "@lib/utils";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

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
    favIconUrl?: string;
}

export default function PopupUsage({
    text,
    usage,
    navigateTo,
    variant,
    origin,
    favIconUrl,
}: PopupUsageProps) {
    if (!usage) return;

    const formatted = totalSizeVideoDisplay(usage);
    const { value, unit } = splitSize(formatted);

    const content = (
        <>
            <span className={"flex size-7 items-center justify-center overflow-hidden rounded-md"}>
                <UsageIcon variant={variant} origin={origin} favIconUrl={favIconUrl} />
            </span>
            <span className="flex flex-1 flex-col gap-0.5">
                <span className="truncate text-[13px] font-medium text-zinc-400">{text}</span>
                <span className="flex items-center">
                    <span className="text-[13px] font-semibold text-white">{value}</span>
                    <span className="ms-1 text-[11px] font-medium text-zinc-400">{unit}</span>
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
    const lang = chrome.i18n.getUILanguage().toLowerCase().startsWith("ar") ? "rtl" : "ltr";

    const Icon = lang === "ltr" ? ChevronRight : ChevronLeft;
    return (
        <Icon className="size-4 text-zinc-600 transition-all duration-150 group-hover:translate-x-px group-hover:text-zinc-300" />
    );
}

function UsageIcon({
    variant,
    origin,
    favIconUrl,
}: {
    variant?: string;
    origin?: string;
    favIconUrl?: string;
}) {
    if (variant === "todayUsage")
        return (
            <div className="relative">
                <Calendar className="size-6.5" strokeWidth={2} />
                <span className="absolute inset-0 flex items-center justify-center pt-1.5 text-[11px] font-semibold">
                    {new Date().getDate()}
                </span>
            </div>
        );

    // On Firefox there is no /_favicon/ endpoint. Prefer the browser-known
    // tab icon (zero requests), then the site's own /favicon.ico, then Globe.
    if (isFirefox()) {
        return (
            <div className="size-6.5">
                <SiteIcon
                    iconUrl={favIconUrl}
                    origin={origin}
                    className="h-full w-full object-cover"
                />
            </div>
        );
    }

    return (
        <div className="size-6.5">
            <SiteIcon origin={origin} className="h-full w-full object-cover" />
        </div>
    );
}
