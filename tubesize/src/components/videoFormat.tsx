import type { HumanizedFormat } from "@app-types/types";

interface Props {
    //item: Exclude<BackgroundResponse["data"], null>["videoFormats"][number];
    item: HumanizedFormat["videoFormats"][number];
    isLive: boolean | undefined;
}

export default function VideoFormat({ item, isLive }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{!isLive ? item.size : item.size + "/hour"}</span>
                <span className="format-size-per-minute">
                    {!isLive ? item.sizePerMinute + "MB/min" : null}
                </span>
            </div>
        </div>
    );
}
