import type { TwitchData } from "@/types/types";
import { filesize } from "filesize";

interface Props {
    item: NonNullable<TwitchData["data"]>[number];
    currentQuality?: number;
}

export default function TwitchFormat({ item, currentQuality }: Props) {
    const className = item.resolution === currentQuality ? "format-item current" : "format-item";

    return (
        <div className={className}>
            <div className="format-height"> {item.resolution} </div>
            <div className="format-size">
                <span>{filesize((item.bandwidth / 8) * 60 * 60) + "/hour"}</span>
                <span className="format-size-per-minute">
                    {filesize((item.bandwidth / 8) * 60) + "/min"}
                </span>
            </div>
        </div>
    );
}
