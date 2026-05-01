import type { StreamInfo, YoutubeVideoFormat } from "@app-types/types";

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

export default function YoutubeFormat({ item, isShorts = false, currentQuality }: Props) {
    const resolution = "height" in item ? item.height : item.resolution;
    const sizePerMinuteMB =
        "sizePerMinuteMB" in item
            ? item.sizePerMinuteMB
            : (item.sizePerSecondBytes * 60) / 1_000_000;
    const sizeDisplay = "sizeMB" in item ? item.sizeMB : perHourDisplay(sizePerMinuteMB * 60);
    const className = resolution === currentQuality ? "format-item current" : "format-item";

    return (
        <div className={className}>
            <div className="format-height">{resolution}p</div>
            <div className="format-size">
                <span>{sizeDisplay}</span>
                <span className="format-size-per-minute">
                    {!isShorts && `${sizePerMinuteMB.toFixed(1)} MB/min`}
                </span>
            </div>
        </div>
    );
}
