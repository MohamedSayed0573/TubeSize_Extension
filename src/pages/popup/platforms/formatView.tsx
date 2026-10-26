import useSettings from "@hooks/useSettings";
import CONFIG from "@lib/constants";

import type { PlatformAdapter, PlatformData } from "@/adapters/types";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useTab from "@/hooks/useTab";
import { t } from "@/i18n/t";

import AdvancedFormatItem from "./advancedFormatItem";
import AudioFormatItem from "./audioFormatItem";
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
    const { query, updateSettingsMutation } = useSettings();
    const { data: settingsState } = query;
    const { mutate: updateSettings } = updateSettingsMutation;
    const advancedView = settingsState?.advancedView ?? CONFIG.DEFAULT_ADVANCED_VIEW;
    const includeAudio = settingsState?.mergeAudio ?? CONFIG.DEFAULT_MERGE_AUDIO;

    const formats = adapter.formats(data);
    const audio = adapter.audio?.(data);
    // The audio row and its merge switch are YouTube-only details.
    const showAudioControls = advancedView && audio !== undefined;

    return (
        <TooltipProvider delay={200}>
            {showAudioControls && (
                <div className="flex items-center justify-between rounded-lg border border-white/8 bg-white/4 px-3 py-1.5">
                    <label
                        htmlFor="mergeAudioToggle"
                        className="cursor-pointer text-xs font-medium text-zinc-400"
                    >
                        {t("popup_includeAudio")}
                    </label>
                    <Switch
                        id="mergeAudioToggle"
                        size="sm"
                        className="cursor-pointer"
                        checked={includeAudio}
                        onClick={() => updateSettings({ mergeAudio: !includeAudio })}
                    />
                </div>
            )}
            {formats.map((format) =>
                advancedView ? (
                    <AdvancedFormatItem
                        key={format.key}
                        format={format}
                        currentQuality={currentQuality?.quality}
                        audio={audio}
                        includeAudio={includeAudio}
                    />
                ) : (
                    // The merge switch only exists in advanced view, so simple
                    // view always shows the merged (default) numbers.
                    <FormatItem
                        key={format.key}
                        format={format}
                        currentQuality={currentQuality?.quality}
                        audio={audio}
                        includeAudio
                    />
                ),
            )}
            {showAudioControls && formats[0] && (
                <AudioFormatItem
                    audio={audio}
                    kind={formats[0].kind}
                    hideRate={formats[0].hideRate}
                />
            )}
        </TooltipProvider>
    );
}
