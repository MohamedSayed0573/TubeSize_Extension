import {
    perHourDisplay,
    perMinuteDisplay,
    totalSizeLiveDisplay,
    totalSizeVideoDisplay,
} from "@lib/formatting";
import type { StreamInfo, YoutubeData, YoutubeVideoFormat } from "@app-types/types";
import clsx from "clsx";

interface Props {
    item: YoutubeData["formats"][number] | StreamInfo;
    isLive: boolean;
    currentQuality: number | undefined;
    durationSeconds?: number;
    isShorts?: boolean;
}

function totalSizeDisplay(
    item: YoutubeData["formats"][number] | StreamInfo,
    durationSeconds: number | undefined,
) {
    return durationSeconds
        ? totalSizeVideoDisplay((item as YoutubeVideoFormat).sizeBytes)
        : totalSizeLiveDisplay(item.sizePerSecondBytes, durationSeconds);
}

export default function FormatItem({
    item,
    isLive,
    isShorts,
    currentQuality,
    durationSeconds,
}: Props) {
    const resolution = isLive
        ? (item as StreamInfo).resolution
        : (item as YoutubeVideoFormat).height;

    return (
        <div
            className={clsx(
                "flex cursor-pointer items-center justify-between rounded-lg border border-teal-950 px-3 py-2.5",
                { "bg-red-800/80 hover:border-red-600": resolution === currentQuality },
                { "bg-stone-800 hover:border-teal-800": resolution !== currentQuality },
            )}
        >
            <div className="pr-2.5 text-sm font-semibold text-white"> {resolution}p </div>
            <div className="flex flex-col items-end text-right text-sm font-semibold text-teal-200">
                <span>
                    {isLive
                        ? perHourDisplay(item.sizePerSecondBytes)
                        : totalSizeDisplay(item, durationSeconds)}
                </span>
                <span className="mt-0.5 text-xs font-normal text-cyan-500">
                    {!isShorts && perMinuteDisplay(item.sizePerSecondBytes)}
                </span>
            </div>
        </div>
    );
}
