import type { StreamInfo, YoutubeVideoFormat } from "@app-types/types";

function sizeDisplay(sizeBytes: number): string {
    const sizeMB = sizeBytes / 1_000_000;
    if (sizeMB >= 1000) {
        return `${(sizeMB / 1000).toFixed(2)} GB`;
    }
    return `${sizeMB.toFixed(2)} MB`;
}

function perMinuteDisplay(sizeBytesPerMinute: number): string {
    const sizeMB = sizeBytesPerMinute / 1_000_000;
    if (sizeMB >= 1000) {
        return `${(sizeMB / 1000).toFixed(2)} GB/min`;
    }
    return `${sizeMB.toFixed(2)} MB/min`;
}

function perHourDisplay(sizeBytesPerHour: number): string {
    const sizeMB = sizeBytesPerHour / 1_000_000;
    if (sizeMB >= 1000) {
        return `${(sizeMB / 1000).toFixed(2)} GB/hour`;
    }
    return `${sizeMB.toFixed(2)} MB/hour`;
}

type Props =
    | {
          type: "video";
          item: YoutubeVideoFormat;
          durationSeconds: number;
          currentQuality: number | undefined;
      }
    | {
          type: "live";
          item: StreamInfo;
          currentQuality: number | undefined;
      };

export default function YoutubeFormat(props: Props) {
    if (props.type === "video") {
        const { item, durationSeconds, currentQuality } = props;
        const sizePerMinuteBytes = item.sizeBytes / (durationSeconds / 60);
        const className = item.height === currentQuality ? "format-item current" : "format-item";

        return (
            <div className={className}>
                <div className="format-height">
                    {" "}
                    {item.height} | {item.formatId}{" "}
                </div>
                <div className="format-size">
                    <span>{sizeDisplay(item.sizeBytes)}</span>
                    <span className="format-size-per-minute">
                        {perMinuteDisplay(sizePerMinuteBytes)}
                    </span>
                </div>
            </div>
        );
    } else {
        const { item, currentQuality } = props;
        const sizePerMinuteBytes = item.sizePerSecondBytes * 60;
        const sizePerHourBytes = item.sizePerSecondBytes * 3600;
        const className =
            item.resolution === currentQuality ? "format-item current" : "format-item";

        return (
            <div className={className}>
                <div className="format-height"> {item.resolution} </div>
                <div className="format-size">
                    <span>{perHourDisplay(sizePerHourBytes)}</span>
                    <span className="format-size-per-minute">
                        {perMinuteDisplay(sizePerMinuteBytes)}
                    </span>
                </div>
            </div>
        );
    }
}
