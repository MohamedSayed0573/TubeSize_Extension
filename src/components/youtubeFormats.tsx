import type { OptionsMap, YoutubeData } from "@app-types/types";
import CONFIG from "@lib/constants";
import useOptions from "@hooks/useOptions";
import useCurrentQuality from "@hooks/useCurrentQuality";
import FormatItem from "@components/formatItem";
import InfoCard from "./infoCard";

function getEnabledOptions(optionsState: OptionsMap | null) {
    const qualityIds = optionsState?.["qualityIds"] ?? {};
    return CONFIG.optionIDs.filter((option) => qualityIds[option] ?? true);
}

export default function YoutubeFormats({
    data,
    tabId,
    tabUrl,
}: {
    data: YoutubeData;
    tabId: number | undefined;
    tabUrl: string | undefined;
}) {
    const { currentQuality } = useCurrentQuality(tabId, tabUrl);

    const { optionsState, error: optionsError } = useOptions();
    if (optionsError) throw optionsError;

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
                        currentQuality={currentQuality}
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
                    currentQuality={currentQuality}
                    durationSeconds={data.durationSeconds}
                />
            );
        });
}
