import type { TwitchData } from "@app-types/types";
import useCurrentQuality from "@hooks/useCurrentQuality";
import useTab from "@hooks/useTab";
import FormatItem from "@components/formatItem";

export default function TwitchFormats({ data }: { data: TwitchData }) {
    const { tabId, tabUrl } = useTab();
    const { currentQuality } = useCurrentQuality(tabId, tabUrl);

    return data.data.map((item) => {
        return (
            <FormatItem
                key={item.resolution}
                item={item}
                durationSeconds={data.type === "vod" ? data.durationSeconds : undefined}
                currentQuality={currentQuality}
                isLive={data.type === "live"}
            />
        );
    });
}
