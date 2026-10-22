import { formatBytes, formatRate } from "@lib/format";
import { cn } from "@lib/utils";

import type { DisplayFormat } from "@/adapters/types";
import { t } from "@/i18n/t";

interface Props {
    format: DisplayFormat;
    currentQuality: number | undefined;
}

export default function FormatItem({ format, currentQuality }: Props) {
    const { resolution, sizePerSecondBytes, hideRate } = format;

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
                        {t("popup_current")}
                    </span>
                )}
            </div>
            <div className="flex flex-col items-end text-right text-sm font-semibold text-teal-200">
                <span>
                    {format.kind === "vod"
                        ? formatBytes(format.sizeBytes)
                        : formatRate(sizePerSecondBytes, "hour")}
                </span>
                <span className="mt-0.5 text-xs font-normal text-cyan-500">
                    {!hideRate && formatRate(sizePerSecondBytes, "minute")}
                </span>
            </div>
        </div>
    );
}
