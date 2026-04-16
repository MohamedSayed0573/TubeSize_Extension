import type { YoutubeBackgroundResponse } from "@app-types/types";

interface Props {
    item: NonNullable<YoutubeBackgroundResponse["data"]>["videoFormats"][number];
    isLive: boolean | undefined;
    isShorts: boolean | undefined;
}

export default function YoutubeFormat({ item, isLive = false, isShorts = false }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{!isLive ? item.sizeMB : item.sizeMB + "/hour"}</span>
                <span className="format-size-per-minute">
                    {isShorts ? null : item.sizePerMinuteMB + "MB/min"}
                </span>
            </div>
        </div>
    );
}
