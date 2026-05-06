import type { KickData } from "@/types/types";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useTab from "@/hooks/useTab";
import FormatItem from "./formatItem";

export default function KickFormats({ data }: { data: KickData }) {
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
