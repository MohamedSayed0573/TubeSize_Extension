import { t } from "@/i18n/t";
import CONFIG from "@lib/constants";
import SettingItem from "@pages/settings/settingItem";
import type { SettingsMap } from "@app-types/types";
import { FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@components/ui/field";

export default function ResolutionsSettings({ settingsState }: { settingsState: SettingsMap }) {
    return (
        <FieldSet>
            <FieldLegend>{t("settings_resolutions_legend")}</FieldLegend>
            <FieldDescription className="text-sm text-zinc-400">
                {t("settings_resolutions_description")}
            </FieldDescription>
            <FieldGroup className="grid grid-cols-3 gap-2.5">
                {CONFIG.optionIDs.map((option) => {
                    return (
                        <SettingItem key={option} option={option} settingsState={settingsState} />
                    );
                })}
            </FieldGroup>
        </FieldSet>
    );
}
