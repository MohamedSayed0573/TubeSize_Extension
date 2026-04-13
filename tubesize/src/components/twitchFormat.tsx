import type { TwitchData } from "@/types/types";
import { filesize } from "filesize";

export default function TwitchFormat({ item }: { item: NonNullable<TwitchData>[number] }) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.resolution} </div>
            <div className="format-size">
                <span className="format-size-per-minute">
                    {filesize((item.bandwidth / 8) * 60) + "/min"}
                </span>
            </div>
        </div>
    );
}
