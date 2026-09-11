import useSettings from "@hooks/useSettings";
import type { SettingsMap } from "@app-types/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@components/ui/field";

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
        <Field
            orientation="horizontal"
            className="flex cursor-pointer items-center justify-between rounded-lg border border-transparent bg-white/3 px-3 py-2.5 pl-3 transition-all hover:border-white/20 hover:bg-white/8"
        >
            <FieldLabel className="cursor-pointer text-xs font-medium text-white" htmlFor={option}>
                {option.slice(1) + "p"}
            </FieldLabel>
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
        </Field>
    );
}
