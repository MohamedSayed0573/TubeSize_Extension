import useSettings from "@hooks/useSettings";
import type { SettingsMap } from "@app-types/types";
import { Checkbox } from "@/components/ui/checkbox";

export default function SettingItem({
    option,
    settingsState,
}: {
    option: string;
    settingsState: SettingsMap;
}) {
    const { updateSettingsMutation } = useSettings();
    const { mutate: updateSettings } = updateSettingsMutation;

    return (
        <div className="flex cursor-pointer items-center justify-between rounded-lg border border-transparent bg-white/3 px-3 py-2.5 pl-3 transition-all hover:border-white/20 hover:bg-white/8">
            <label className="cursor-pointer text-xs font-medium text-white" htmlFor={option}>
                {option.slice(1) + "p"}
            </label>
            <Checkbox
                id={option}
                checked={settingsState["qualityIds"]?.[option] ?? true}
                onCheckedChange={(checked) => {
                    updateSettings({
                        qualityIds: {
                            ...settingsState["qualityIds"],
                            [option]: checked,
                        },
                    });
                }}
            />
        </div>
    );
}
