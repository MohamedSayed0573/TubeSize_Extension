import type { OptionsMap } from "@app-types/types";
import useOptions from "@hooks/useOptions";
import { cn } from "@lib/utils";
import CONFIG from "@lib/constants";
import { Switch } from "@/components/ui/switch";
import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import { Slider } from "@components/ui/slider";
import { useState } from "react";

export default function ToasterSettings({ optionsState }: { optionsState: OptionsMap }) {
    const toasterThreshold = optionsState.toasterThreshold ?? CONFIG.DEFAULT_TOASTER_THRESHOLD;
    const isToasterEnabled = optionsState.toasterEnabled ?? CONFIG.DEFAULT_TOASTER_ENABLED;
    const [threshold, setThreshold] = useState(toasterThreshold);

    const { updateOptionsMutation } = useOptions();
    const { mutate: updateOptions } = updateOptionsMutation;

    return (
        <FieldSet className="mt-2 p-3.5">
            <FieldLegend className="m-0 p-0">Data Usage Alert</FieldLegend>
            <FieldDescription className="text-xs text-zinc-400">
                Show a warning when you watch a video that uses too much internet data.
            </FieldDescription>

            <FieldGroup
                className={cn(
                    "rounded-lg border border-white/5 bg-white/4 px-4 py-2 pb-4 transition-all duration-300 hover:border-white/15 hover:bg-white/8",
                    !isToasterEnabled && "bg-white/1 opacity-80",
                )}
            >
                <Field orientation="horizontal">
                    <FieldLabel htmlFor="toasterThresholdToggle">
                        Enable Data Usage Alert
                    </FieldLabel>
                    <Switch
                        id="toasterThresholdToggle"
                        className="cursor-pointer"
                        checked={isToasterEnabled}
                        onClick={() => {
                            updateOptions({ toasterEnabled: !isToasterEnabled });
                        }}
                    />
                </Field>

                <Field className="gap-3.5">
                    <FieldLabel
                        className="text-xs font-medium whitespace-nowrap"
                        htmlFor="toasterThreshold"
                    >
                        Usage Limit (MB/hour): {threshold}
                    </FieldLabel>
                    <Slider
                        id="toasterThreshold"
                        value={threshold}
                        onValueChange={(value) => setThreshold(value as number)}
                        onValueCommitted={(value) =>
                            updateOptions({ toasterThreshold: value as number })
                        }
                        max={1000}
                        min={200}
                        step={10}
                        className="w-full"
                        aria-label="Usage limit"
                    />
                </Field>
            </FieldGroup>
        </FieldSet>
    );
}
