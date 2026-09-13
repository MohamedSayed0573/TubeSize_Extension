import type { SettingsMap } from "@app-types/types";
import useSettings from "@hooks/useSettings";
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
import { useTranslation } from "react-i18next";

export default function ToasterSettings({ settingsState }: { settingsState: SettingsMap }) {
    const { t } = useTranslation();
    const toasterThreshold = settingsState.toasterThreshold ?? CONFIG.DEFAULT_TOASTER_THRESHOLD;
    const isToasterEnabled = settingsState.toasterEnabled ?? CONFIG.DEFAULT_TOASTER_ENABLED;
    const [threshold, setThreshold] = useState(toasterThreshold);

    const { updateSettingsMutation } = useSettings();
    const { mutate: updateSettings } = updateSettingsMutation;

    return (
        <FieldSet>
            <FieldLegend>{t("settings.toaster.legend")}</FieldLegend>
            <FieldDescription className="text-xs text-zinc-400">
                {t("settings.toaster.description")}
            </FieldDescription>

            <FieldGroup
                className={cn(
                    "rounded-lg border border-white/5 bg-white/4 p-3 transition-all duration-300 hover:border-white/15 hover:bg-white/8",
                    !isToasterEnabled && "bg-white/1 opacity-60",
                )}
            >
                <Field orientation="horizontal">
                    <FieldLabel htmlFor="toasterThresholdToggle">
                        {t("settings.toaster.enable")}
                    </FieldLabel>
                    <Switch
                        id="toasterThresholdToggle"
                        className="cursor-pointer"
                        checked={isToasterEnabled}
                        onClick={() => {
                            updateSettings({ toasterEnabled: !isToasterEnabled });
                        }}
                    />
                </Field>

                <Field className="gap-3.5">
                    <FieldLabel
                        className="text-xs font-medium whitespace-nowrap"
                        htmlFor="toasterThreshold"
                    >
                        {t("settings.toaster.usageLimit", { threshold })}
                    </FieldLabel>
                    <Slider
                        id="toasterThreshold"
                        value={threshold}
                        onValueChange={(value) => setThreshold(value as number)}
                        onValueCommitted={(value) =>
                            updateSettings({ toasterThreshold: value as number })
                        }
                        max={1000}
                        min={200}
                        step={10}
                        className={cn("w-full", !isToasterEnabled && "cursor-not-allowed")}
                        aria-label={t("settings.toaster.usageLimitAria")}
                        disabled={!isToasterEnabled}
                    />
                </Field>
            </FieldGroup>
        </FieldSet>
    );
}
