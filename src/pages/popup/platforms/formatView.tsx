import type { PlatformAdapter, PlatformData } from "@/adapters/types";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useTab from "@/hooks/useTab";

import FormatItem from "./formatItem";

export default function FormatView({
    adapter,
    data,
}: {
    adapter: PlatformAdapter;
    data: PlatformData;
}) {
    const { data: tabData } = useTab();
    const { currentQuality } = useCurrentQuality(tabData?.tabId);

    return adapter.formats(data).map((format) => {
        return (
            <FormatItem key={format.key} format={format} currentQuality={currentQuality?.quality} />
        );
    });
}
