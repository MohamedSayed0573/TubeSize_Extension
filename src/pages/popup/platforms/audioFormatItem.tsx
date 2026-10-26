import { formatAudioCodec, formatBitrate, formatBytes, formatRate } from "@lib/format";
import { cn } from "@lib/utils";
import { AudioLines } from "lucide-react";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/t";

interface Props {
    audio: AudioStreamInfo;
    kind: DisplayFormat["kind"];
    hideRate?: boolean;
}

export default function AudioFormatItem({ audio, kind, hideRate }: Props) {
    const bytesPerSecond = audio.bitrate !== undefined ? audio.bitrate / 8 : undefined;

    return (
        <Tooltip>
            <TooltipTrigger
                delay={200}
                closeDelay={50}
                render={<div />}
                className="flex cursor-pointer items-center justify-between rounded-lg border border-teal-950 bg-slate-800 px-3 py-2.5 hover:border-teal-800"
                dir="ltr"
            >
                <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                        <AudioLines className="size-3.5 text-white" aria-hidden="true" />
                        <span className="text-sm font-semibold text-white">{t("popup_audio")}</span>
                    </div>
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-normal whitespace-nowrap text-teal-300/90">
                        {audio.codec && <span>{formatAudioCodec(audio.codec)}</span>}
                        <span className="text-teal-400/70">itag {audio.formatId}</span>
                    </span>
                </div>
                <div className="flex shrink-0 flex-col items-end text-right text-sm font-semibold whitespace-nowrap text-teal-200">
                    <span>
                        {kind === "vod"
                            ? audio.sizeBytes !== undefined && formatBytes(audio.sizeBytes)
                            : bytesPerSecond !== undefined && formatRate(bytesPerSecond, "hour")}
                    </span>
                    {!hideRate && bytesPerSecond !== undefined && (
                        <span className="mt-0.5 text-xs font-normal text-cyan-500">
                            {formatRate(bytesPerSecond, "minute")}
                        </span>
                    )}
                </div>
            </TooltipTrigger>

            {audio.itags && audio.itags.length > 0 && (
                <TooltipContent>
                    <div className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                        {t("popup_audio")} itags
                    </div>
                    <ul className="flex flex-col gap-1">
                        {audio.itags.map((itag) => (
                            <li
                                key={itag.formatId}
                                className={cn(
                                    "flex items-center justify-between gap-3",
                                    itag.formatId === audio.formatId
                                        ? "font-semibold text-teal-200"
                                        : "text-zinc-400",
                                )}
                            >
                                <span>itag {itag.formatId}</span>
                                <span className="flex items-center gap-1.5">
                                    {itag.codec && <span>{formatAudioCodec(itag.codec)}</span>}
                                    {itag.bitrate !== undefined && (
                                        <span>{formatBitrate(itag.bitrate)}</span>
                                    )}
                                </span>
                            </li>
                        ))}
                    </ul>
                </TooltipContent>
            )}
        </Tooltip>
    );
}
