import type { OptionsMap, YoutubeData } from "@app-types/types";
import CONFIG from "@lib/constants";
import useOptions from "@hooks/useOptions";
import useCurrentQuality from "@hooks/useCurrentQuality";
import FormatItem from "@pages/popup/platforms/formatItem";
import InfoCard from "@components/infoCard";

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
    const { data: optionsState, isError, error, isPending } = query;
    if (isError) throw error;
    if (isPending) return null;

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
                        isLive={true}
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
                    isLive={false}
                    isShorts={data.isShorts || false}
                    currentQuality={currentQuality?.quality}
                    durationSeconds={data.durationSeconds}
                />
            );
        });
}
