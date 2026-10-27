import { formatCodec, formatDisplaySizes } from "@lib/format";
import { cn } from "@lib/utils";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/t";

import SizeColumn from "./sizeColumn";

interface Props {
    format: DisplayFormat;
    currentQuality: number | undefined;
    audio: AudioStreamInfo | undefined;
    includeAudio: boolean;
}

export default function AdvancedFormatItem({ format, currentQuality, audio, includeAudio }: Props) {
    const { resolution, codec, formatId, fps, itags } = format;
    const isCurrent = resolution === currentQuality;
    const hasFormatDetails = codec !== undefined || formatId !== undefined || fps !== undefined;

    return (
        <Tooltip>
            <TooltipTrigger
                delay={200}
                closeDelay={50}
                render={<div />}
                className={cn(
                    "flex cursor-pointer items-center justify-between rounded-lg border border-teal-950 bg-stone-800 px-3 py-2.5 hover:border-teal-800",
                    { "bg-red-800/80 hover:border-red-600": isCurrent },
                )}
                dir="ltr"
            >
                <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                        <span className="text-sm font-semibold text-white">{resolution}p</span>
                        {isCurrent && (
                            <span className="rounded-full bg-white/15 px-1 py-0.5 text-[10px] font-bold tracking-wide text-white">
                                {t("popup_current")}
                            </span>
                        )}
                    </div>
                    {hasFormatDetails && (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal whitespace-nowrap text-teal-300/90">
                            {codec && <span>{formatCodec(codec)}</span>}
                            {formatId !== undefined && (
                                <span className="text-teal-400/70">itag {formatId}</span>
                            )}
                            {fps !== undefined && (
                                <span className="text-cyan-400/80">{fps}fps</span>
                            )}
                        </span>
                    )}
                </div>
                <SizeColumn {...formatDisplaySizes(format, audio, includeAudio)} />
            </TooltipTrigger>

            {itags && itags.length > 0 && (
                <TooltipContent>
                    <div className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                        {resolution}p itags
                    </div>
                    <ul className="flex flex-col gap-1">
                        {itags.map((itag) => (
                            <li
                                key={itag.formatId}
                                className={cn(
                                    "flex items-center justify-between gap-3",
                                    itag.formatId === formatId
                                        ? "font-semibold text-teal-200"
                                        : "text-zinc-400",
                                )}
                            >
                                <span>itag {itag.formatId}</span>
                                {(itag.codec || itag.fps !== undefined) && (
                                    <span className="flex items-center gap-1.5">
                                        {itag.fps !== undefined && <span>{itag.fps} fps</span>}
                                        {itag.codec && <span>{formatCodec(itag.codec)}</span>}
                                    </span>
                                )}
                            </li>
                        ))}
                    </ul>
                </TooltipContent>
            )}
        </Tooltip>
    );
}
