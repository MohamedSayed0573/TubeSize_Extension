import type { MediaEstimate } from "@app-types/platforms.types";
import Spinner from "@components/spinner";
import useSettings from "@hooks/useSettings";
import { projectEstimateFormats } from "@lib/mediaEstimate";

import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import useCurrentQuality from "@/hooks/useCurrentQuality";
import useTab from "@/hooks/useTab";
import { t } from "@/i18n/t";

import AdvancedFormatItem from "./advancedFormatItem";
import AudioFormatItem from "./audioFormatItem";
import FormatItem from "./formatItem";

export default function FormatView({ estimate }: { estimate: MediaEstimate }) {
    const { data: tabData } = useTab();
    const { currentQuality } = useCurrentQuality(tabData?.tabId);
    const { query, updateSettingsMutation } = useSettings();
    const { mutate: updateSettings, isPending } = updateSettingsMutation;

    if (query.isPending) return <Spinner />;
    if (query.isError) throw query.error;

    const { advancedView, includeAudio } = query.data;

    const { audio } = estimate;
    const showAudioControls = advancedView && audio !== undefined;
    const formats = projectEstimateFormats(estimate, {
        includeAudio: advancedView ? includeAudio : true,
    });

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
                            disabled={isPending}
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
                    />
                ) : (
                    <FormatItem
                        key={format.key}
                        format={format}
                        currentQuality={currentQuality?.quality}
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
