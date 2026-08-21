import type { YoutubeData } from "@app-types/platforms.types";
import CONFIG from "@lib/constants";
import useOptions from "@hooks/useOptions";
import useCurrentQuality from "@hooks/useCurrentQuality";
import FormatItem from "@pages/popup/platforms/formatItem";
import InfoCard from "@components/infoCard";
import type { OptionsMap } from "@app-types/types";

function getEnabledOptions(optionsState: OptionsMap | undefined) {
    const qualityIds = optionsState?.["qualityIds"] ?? {};
    return CONFIG.optionIDs.filter((option) => qualityIds[option] ?? true);
}

export default function YoutubeFormats({
    data,
    tabId,
}: {
    data: YoutubeData;
    tabId: number | undefined;
}) {
    const { currentQuality } = useCurrentQuality(tabId);

    const { query } = useOptions();
    const { data: optionsState } = query;

    const enabledOptions = getEnabledOptions(optionsState);

    if (enabledOptions.length === 0) {
        return <InfoCard message="All Resolutions Disabled. Enable in options" />;
    }

    if (data.type === "live") {
        return data.formats
            .filter((item) => {
                return enabledOptions.includes("p" + item.resolution);
            })
            .map((item) => {
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
    return data.formats
        .filter((item) => {
            return enabledOptions.includes("p" + item.height);
        })
        .map((item) => {
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
