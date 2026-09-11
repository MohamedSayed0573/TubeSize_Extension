import ToasterSettings from "@pages/settings/toasterSettings";
import useSettings from "@hooks/useSettings";
import { SettingsFooter } from "@pages/settings/settingsFooter";
import ResolutionsSettings from "@pages/settings/resolutionsSettings";
import Spinner from "@components/spinner";
import HeaderSettings from "./headerSettings";
import { FieldSeparator } from "@components/ui/field";

export default function Settings() {
    const { query } = useSettings();

    const { data: settingsState, error, isPending, isError } = query;
    if (isError) throw error;
    if (isPending) return <Spinner />;

    return (
        <div className="w-72.5">
            <HeaderSettings />

            <div className="flex flex-col gap-2 px-3 py-2">
                <ResolutionsSettings settingsState={settingsState} />
                <FieldSeparator />
                <ToasterSettings settingsState={settingsState} />
            </div>

            <FieldSeparator />
            <SettingsFooter />
        </div>
    );
}
