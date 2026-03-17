import type { BackgroundResponse } from "../types/types";

interface Props {
    item: Exclude<BackgroundResponse["data"], null>["videoFormats"][number];
}

export default function VideoFormat({ item }: Props) {
    return (
        <div className="format-item">
            <div className="format-height"> {item.height} </div>
            <div className="format-size">{item.size}</div>
        </div>
    );
}
