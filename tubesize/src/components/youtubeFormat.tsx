import type { StreamInfo, YoutubeVideoFormat } from "@app-types/types";
import { filesize } from "filesize";

interface Props {
    item: YoutubeVideoFormat | StreamInfo;
    isLive: boolean | undefined;
    isShorts?: boolean;
    currentQuality: number | undefined;
}

function perHourDisplay(sizePerHourMB: number): string {
    if (sizePerHourMB >= 1000) {
        return `${(sizePerHourMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizePerHourMB.toFixed(2)} MB/hour`;
}

export default function YoutubeFormat({ item, isLive, isShorts = false, currentQuality }: Props) {
    const sizePerMinuteMB = (item.sizePerSecondBytes * 60) / 1_000_000;
    const resolution = isLive
        ? (item as StreamInfo).resolution
        : (item as YoutubeVideoFormat).height;

    const className = resolution === currentQuality ? "format-item current" : "format-item";

    return (
        <div className={className}>
            <div className="format-height">{resolution}p</div>
            <div className="format-size">
                <span>
                    {isLive
                        ? perHourDisplay(sizePerMinuteMB * 60)
                        : `${filesize((item as YoutubeVideoFormat).sizeBytes / 1_000_000).toFixed(1)} MB/min`}
                </span>
                <span className="format-size-per-minute">
                    {!isShorts && `${sizePerMinuteMB.toFixed(1)} MB/min`}
                </span>
            </div>
        </div>
    );
}
