import type { YoutubeBackgroundResponse } from "@app-types/types";

interface Props {
    item: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"][number];
    isLive: boolean | undefined;
    isShorts: boolean | undefined;
    currentQuality: number | undefined;
}

export default function YoutubeFormat({
    item,
    isLive = false,
    isShorts = false,
    currentQuality,
}: Props) {
    const className = item?.height === currentQuality ? "format-item current" : "format-item";
    return (
        <div className={className}>
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{isLive ? item.sizeMB + "/hour" : item.sizeMB}</span>
                <span className="format-size-per-minute">
                    {!isShorts && item.sizePerMinuteMB + "MB/min "}
                </span>
            </div>
        </div>
    );
}
