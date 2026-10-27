import type { SettingsMap } from "@app-types/types";
import useSettings from "@hooks/useSettings";
import CONFIG from "@lib/constants";

import {
    Field,
    FieldDescription,
    FieldGroup,
    FieldLabel,
    FieldLegend,
    FieldSet,
} from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { t } from "@/i18n/t";

export default function AdvancedViewSettings({ settingsState }: { settingsState: SettingsMap }) {
    const isAdvancedView = settingsState.advancedView ?? CONFIG.DEFAULT_ADVANCED_VIEW;

    const { updateSettingsMutation } = useSettings();
    const { mutate: updateSettings } = updateSettingsMutation;

    return (
        <FieldSet>
            <FieldLegend>{t("settings_advancedView_legend")}</FieldLegend>
            <FieldDescription className="text-xs text-zinc-400">
                {t("settings_advancedView_description")}
            </FieldDescription>

            <FieldGroup className="rounded-lg border border-white/5 bg-white/4 p-3 transition-all duration-300 hover:border-white/15 hover:bg-white/8">
                <Field orientation="horizontal">
                    <FieldLabel htmlFor="advancedViewToggle">
                        {t("settings_advancedView_enable")}
                    </FieldLabel>
                    <Switch
                        id="advancedViewToggle"
                        className="cursor-pointer"
                        checked={isAdvancedView}
                        onClick={() => {
                            updateSettings({ advancedView: !isAdvancedView });
                        }}
                    />
                </Field>
            </FieldGroup>
        </FieldSet>
    );
}
