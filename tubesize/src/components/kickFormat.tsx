import { perHourDisplay, perMinuteDisplay, totalSizeLiveDisplay } from "@/lib/formatting";
import type { KickData } from "@app-types/types";

interface Props {
    item: KickData["data"][number];
    currentQuality: number | undefined;
    isLive: boolean;
    durationSeconds: number | undefined;
}

export default function KickFormat({ item, currentQuality, isLive, durationSeconds }: Props) {
    const className = item.resolution === currentQuality ? "format-item current" : "format-item";

    return (
        <div className={className}>
            <div className="format-height"> {item.resolution}p </div>
            <div className="format-size">
                <span>
                    {isLive
                        ? perHourDisplay(item.sizePerSecondBytes)
                        : totalSizeLiveDisplay(item.sizePerSecondBytes, durationSeconds)}
                </span>
                <span className="format-size-per-minute">
                    {perMinuteDisplay(item.sizePerSecondBytes)}
                </span>
            </div>
        </div>
    );
}
