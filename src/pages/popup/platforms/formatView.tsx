import useSettings from "@hooks/useSettings";
import CONFIG from "@lib/constants";

import type { PlatformAdapter, PlatformData } from "@/adapters/types";
import { TooltipProvider } from "@/components/ui/tooltip";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useTab from "@/hooks/useTab";

import AdvancedFormatItem from "./advancedFormatItem";
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
    const { data: settingsState } = useSettings().query;
    const advancedView = settingsState?.advancedView ?? CONFIG.DEFAULT_ADVANCED_VIEW;

    return (
        <TooltipProvider delay={200}>
            {adapter
                .formats(data)
                .map((format) =>
                    advancedView ? (
                        <AdvancedFormatItem
                            key={format.key}
                            format={format}
                            currentQuality={currentQuality?.quality}
                        />
                    ) : (
                        <FormatItem
                            key={format.key}
                            format={format}
                            currentQuality={currentQuality?.quality}
                        />
                    ),
                )}
        </TooltipProvider>
    );
}
