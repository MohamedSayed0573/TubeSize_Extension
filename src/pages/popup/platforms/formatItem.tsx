import type { DisplayFormat } from "@app-types/platforms.types";
import { formatDisplaySizes } from "@lib/format";
import { cn } from "@lib/utils";

import { t } from "@/i18n/t";

import SizeColumn from "./sizeColumn";

interface Props {
    format: DisplayFormat;
    currentQuality: number | undefined;
}

export default function FormatItem({ format, currentQuality }: Props) {
    const { resolution } = format;
    const isCurrent = resolution > 0 && resolution === currentQuality;
    const qualityLabel = resolution > 0 ? `${resolution}p` : t("common_video");

    return (
        <div
            className={cn(
                "flex cursor-pointer items-center justify-between rounded-lg border border-teal-950 bg-stone-800 px-3 py-2.5 hover:border-teal-800",
                { "bg-red-800/80 hover:border-red-600": isCurrent },
            )}
            dir="ltr"
        >
            <div className="flex items-center justify-between">
                <div className="pr-2.5 text-sm font-semibold text-white">{qualityLabel}</div>
                {isCurrent && (
                    <span className="rounded-full bg-white/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wider text-white">
                        {t("popup_current")}
                    </span>
                )}
            </div>
            <SizeColumn {...formatDisplaySizes(format)} />
        </div>
    );
}
