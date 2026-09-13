import { perHourDisplay, perMinuteDisplay, totalSizeVideoDisplay } from "@lib/formatting";
import type { YoutubeData } from "@app-types/platforms.types";
import { cn } from "@lib/utils";
import { useTranslation } from "react-i18next";

interface Props {
    item: YoutubeData["formats"][number];
    currentQuality: number | undefined;
    isShorts?: boolean;
}

export default function FormatItem({ item, isShorts, currentQuality }: Props) {
    const { t } = useTranslation();
    const resolution = item.type === "live" ? item.resolution : item.height;

    return (
        <div
            className={cn(
                "flex cursor-pointer items-center justify-between rounded-lg border border-teal-950 bg-stone-800 px-3 py-2.5 hover:border-teal-800",
                { "bg-red-800/80 hover:border-red-600": resolution === currentQuality },
            )}
            dir="ltr"
        >
            <div className="flex items-center justify-between">
                <div className="pr-2.5 text-sm font-semibold text-white"> {resolution}p </div>
                {resolution === currentQuality && (
                    <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-white">
                        {t("popup.current")}
                    </span>
                )}
            </div>
            <div className="flex flex-col items-end text-right text-sm font-semibold text-teal-200">
                <span>
                    {item.type === "live"
                        ? perHourDisplay(item.sizePerSecondBytes)
                        : totalSizeVideoDisplay(item.sizeBytes)}
                </span>
                <span className="mt-0.5 text-xs font-normal text-cyan-500">
                    {!isShorts && perMinuteDisplay(item.sizePerSecondBytes)}
                </span>
            </div>
        </div>
    );
}
