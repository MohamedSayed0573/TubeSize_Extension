import CONFIG from "@lib/constants";
import SettingItem from "@pages/settings/settingItem";
import type { SettingsMap } from "@app-types/types";
import { FieldLegend } from "@components/ui/field";

export default function ResolutionsSettings({ settingsState }: { settingsState: SettingsMap }) {
    return (
        <div className="p-3">
            <FieldLegend className="m-0 p-0">Resolutions</FieldLegend>
            <div className="mb-2 text-sm text-zinc-400">
                Select which resolutions to display when you click on the extension icon:
            </div>
            <div className="grid grid-cols-3 gap-2.5">
                {CONFIG.optionIDs.map((option) => {
                    return (
                        <SettingItem key={option} option={option} settingsState={settingsState} />
                    );
                })}
            </div>
        </div>
    );
}
