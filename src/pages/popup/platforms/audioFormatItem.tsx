import {
    audioBytesPerSecond,
    formatAudioCodec,
    formatBitrate,
    formatBytes,
    formatRate,
} from "@lib/format";
import { cn } from "@lib/utils";
import { AudioLines } from "lucide-react";

import type { AudioStreamInfo, DisplayFormat } from "@/adapters/types";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/t";

import SizeColumn from "./sizeColumn";

interface Props {
    audio: AudioStreamInfo;
    kind: DisplayFormat["kind"];
    hideRate?: boolean;
}

export default function AudioFormatItem({ audio, kind, hideRate }: Props) {
    const { formatId, codec, bitrate, sizeBytes, itags } = audio;
    const bytesPerSecond = audioBytesPerSecond(audio);

    let primary: string | undefined;
    if (kind === "vod") primary = formatBytes(sizeBytes);
    else if (bitrate !== undefined) primary = formatRate(bytesPerSecond, "hour");

    const secondary =
        !hideRate && bitrate !== undefined ? formatRate(bytesPerSecond, "minute") : undefined;

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
                        {codec && <span>{formatAudioCodec(codec)}</span>}
                        <span className="text-teal-400/70">itag {formatId}</span>
                    </span>
                </div>
                <SizeColumn primary={primary} secondary={secondary} />
            </TooltipTrigger>

            {itags.length > 0 && (
                <TooltipContent>
                    <div className="mb-1 text-[10px] font-semibold tracking-wider text-zinc-500 uppercase">
                        {t("popup_audio")} itags
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
