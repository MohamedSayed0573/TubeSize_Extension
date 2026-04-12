import type { HumanizedFormat } from "@app-types/types";

interface Props {
    //item: Exclude<BackgroundResponse["data"], null>["videoFormats"][number];
    item: HumanizedFormat["videoFormats"][number];
}

export default function VideoFormat({ item }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">
                <span>{item.size}</span>
                <span className="format-size-per-minute">{item.sizePerMinute} MB/min</span>
            </div>
        </div>
    );
}
