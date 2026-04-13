import type { BackgroundResponse, APIData } from "@app-types/types";

interface Props {
    item: Exclude<BackgroundResponse["data"], APIData | null | undefined>["videoFormats"][number];
    isLive: boolean | undefined;
    isShorts: boolean | undefined;
}

export default function VideoFormat({ item, isLive = false, isShorts = false }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{!isLive ? item.sizeMB : item.sizeMB + "/hour"}</span>
                <span className="format-size-per-minute">
                    {isLive || isShorts ? null : item.sizePerMinuteMB + "MB/min"}
                </span>
            </div>
        </div>
    );
}
