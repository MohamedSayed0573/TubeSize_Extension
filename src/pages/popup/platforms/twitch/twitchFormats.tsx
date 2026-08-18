import type { TwitchData } from "@app-types/types";
import useCurrentQuality from "@hooks/useCurrentQuality";
import useTab from "@hooks/useTab";
import FormatItem from "../formatItem";

export default function TwitchFormats({ data }: { data: TwitchData }) {
    const { data: tabData } = useTab();
    const { currentQuality } = useCurrentQuality(tabData?.tabId);

    return data.data.map((item) => {
        return (
            <FormatItem
                key={item.resolution}
                item={item}
                durationSeconds={data.type === "vod" ? data.durationSeconds : undefined}
                currentQuality={currentQuality?.quality}
                isLive={data.type === "live"}
            />
        );
    });
}
