import { perHourDisplay, perMinuteDisplay, totalSizeVideoDisplay } from "@/lib/formatting";
import type { StreamInfo, YoutubeData, YoutubeVideoFormat } from "@app-types/types";

interface Props {
    item: YoutubeData["formats"][number];
    isLive: boolean;
    isShorts: boolean;
    currentQuality: number | undefined;
}

export default function YoutubeFormat({ item, isLive, isShorts, currentQuality }: Props) {
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
                        : totalSizeVideoDisplay((item as YoutubeVideoFormat).sizeBytes)}
                </span>
                <span className="format-size-per-minute">
                    {!isShorts && perMinuteDisplay(item.sizePerSecondBytes)}
                </span>
            </div>
        </div>
    );
}
