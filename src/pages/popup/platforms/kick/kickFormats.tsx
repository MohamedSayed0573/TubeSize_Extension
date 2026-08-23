import type { KickData } from "@app-types/platforms.types";
import useCurrentQuality from "@hooks/useCurrentQuality";
import useTab from "@hooks/useTab";
import FormatItem from "@pages/popup/platforms/formatItem";

export default function KickFormats({ data }: { data: KickData }) {
    const { data: tabData } = useTab();
    const { currentQuality } = useCurrentQuality(tabData?.tabId);

    return data.data.map((item) => {
        return (
            <FormatItem
                key={item.resolution}
                item={item}
                currentQuality={currentQuality?.quality}
            />
        );
    });
}
