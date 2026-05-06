import {
    perHourDisplay,
    perMinuteDisplay,
    totalSizeLiveDisplay,
    totalSizeVideoDisplay,
} from "@lib/formatting";
import type { StreamInfo, YoutubeData, YoutubeVideoFormat } from "@app-types/types";

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

    const className = resolution === currentQuality ? "format-item current" : "format-item";

    return (
        <div className={className}>
            <div className="format-height"> {resolution}p </div>
            <div className="format-size">
                <span>
                    {isLive
                        ? perHourDisplay(item.sizePerSecondBytes)
                        : totalSizeDisplay(item, durationSeconds)}
                </span>
                <span className="format-size-per-minute">
                    {!isShorts && perMinuteDisplay(item.sizePerSecondBytes)}
                </span>
            </div>
        </div>
    );
}
