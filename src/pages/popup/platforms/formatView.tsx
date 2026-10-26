import useSettings from "@hooks/useSettings";
import CONFIG from "@lib/constants";

import type { PlatformAdapter, PlatformData } from "@/adapters/types";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
    const includeAudio = settingsState?.includeAudio ?? CONFIG.DEFAULT_INCLUDE_AUDIO;

    const formats = adapter.formats(data);
    const audio = adapter.audio?.(data);
    // The audio row and its include-audio switch are YouTube-only details.
    const showAudioControls = advancedView && audio !== undefined;

    return (
        <TooltipProvider delay={200}>
            {showAudioControls && (
                <FieldGroup className="rounded-lg border border-teal-950 bg-stone-800 px-3 py-1.5">
                    <Field orientation="horizontal">
                        <FieldLabel
                            htmlFor="includeAudioToggle"
                            className="cursor-pointer text-xs font-medium text-zinc-400"
                        >
                            {t("popup_includeAudio")}
                        </FieldLabel>
                        <Switch
                            id="includeAudioToggle"
                            size="sm"
                            className="cursor-pointer"
                            checked={includeAudio}
                            onClick={() => updateSettings({ includeAudio: !includeAudio })}
                        />
                    </Field>
                </FieldGroup>
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
                    // The include-audio switch only exists in advanced view, so the
                    // simple view always shows the merged (default) numbers.
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
