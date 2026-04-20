import { bandwidthToSizePerHourMB, bandwidthToSizePerMinuteMB } from "@/lib/utils";
import type { TwitchData } from "@/types/types";

interface Props {
    item: NonNullable<TwitchData["data"]>[number];
    currentQuality?: number;
}

export default function TwitchFormat({ item, currentQuality }: Props) {
    const className = item.resolution === currentQuality ? "format-item current" : "format-item";
    const sizePerHourMB = bandwidthToSizePerHourMB(item.bandwidth);
    const sizePerMinuteMB = bandwidthToSizePerMinuteMB(item.bandwidth);
    const perHourDisplay =
        sizePerHourMB >= 1000
            ? `${(sizePerHourMB / 1000).toFixed(1)} GB/hour`
            : `${sizePerHourMB.toFixed(1)} MB/hour`;

    return (
        <div className={className}>
            <div className="format-height"> {item.resolution} </div>
            <div className="format-size">
                <span>{perHourDisplay}</span>
                <span className="format-size-per-minute">
                    {`${sizePerMinuteMB.toFixed(1)} MB/min`}
                </span>
            </div>
        </div>
    );
}
