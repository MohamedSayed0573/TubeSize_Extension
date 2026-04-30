import type { TwitchData } from "@/types/types";

interface Props {
    item: NonNullable<TwitchData["data"]>[number];
    currentQuality?: number;
    isLive: boolean;
    durationSeconds?: number;
}

function totalSizeDisplay(sizePerMinuteMB: number, durationSeconds?: number): string {
    if (!durationSeconds) return "";
    const totalSizeMB = (sizePerMinuteMB / 60) * durationSeconds;
    if (totalSizeMB >= 1000) {
        return `${(totalSizeMB / 1000).toFixed(2)} GB`;
    }
    return `${totalSizeMB.toFixed(2)} MB`;
}

function perHourDisplay(sizePerHourMB: number): string {
    if (sizePerHourMB >= 1000) {
        return `${(sizePerHourMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizePerHourMB.toFixed(2)} MB/hour`;
}

export default function TwitchFormat({ item, currentQuality, isLive, durationSeconds }: Props) {
    const className = item.resolution === currentQuality ? "format-item current" : "format-item";
    const sizePerMinuteMB = (item.sizePerSecondBytes * 60) / 1_000_000;
    const sizePerHourMB = sizePerMinuteMB * 60;

    return (
        <div className={className}>
            <div className="format-height"> {item.resolution} </div>
            <div className="format-size">
                <span>
                    {isLive
                        ? perHourDisplay(sizePerHourMB)
                        : totalSizeDisplay(sizePerMinuteMB, durationSeconds)}
                </span>
                <span className="format-size-per-minute">
                    {`${sizePerMinuteMB.toFixed(1)} MB/min`}
                </span>
            </div>
        </div>
    );
}
