import type { HumanizedFormat } from "@app-types/types";

interface Props {
    //item: Exclude<BackgroundResponse["data"], null>["videoFormats"][number];
    item: HumanizedFormat["videoFormats"][number];
    isLive: boolean | undefined;
    isShorts: boolean | undefined;
}

export default function VideoFormat({ item, isLive, isShorts }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{!isLive ? item.size : item.size + "/hour"}</span>
                <span className="format-size-per-minute">
                    {isLive || isShorts ? null : item.sizePerMinute + "MB/min"}
                </span>
            </div>
        </div>
    );
}
