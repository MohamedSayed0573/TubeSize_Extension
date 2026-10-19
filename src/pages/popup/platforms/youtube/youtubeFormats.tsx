import type { YoutubeData } from "@app-types/platforms.types";
import useCurrentQuality from "@hooks/useCurrentQuality";
import FormatItem from "@pages/popup/platforms/formatItem";

export default function YoutubeFormats({
    data,
    tabId,
}: {
    data: YoutubeData;
    tabId: number | undefined;
}) {
    const { currentQuality } = useCurrentQuality(tabId);

    if (data.type === "live") {
        return data.formats.map((item) => {
            return (
                <FormatItem
                    key={item.resolution}
                    item={item}
                    currentQuality={currentQuality?.quality}
                    isShorts={false}
                />
            );
        });
    }

    return data.formats.map((item) => {
        return (
            <FormatItem
                key={item.formatId}
                item={item}
                isShorts={data.isShorts || false}
                currentQuality={currentQuality?.quality}
            />
        );
    });
}
