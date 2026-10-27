import Spinner from "@components/spinner";
import { FieldSeparator } from "@components/ui/field";
import useSettings from "@hooks/useSettings";
import { SettingsFooter } from "@pages/settings/settingsFooter";
import ToasterSettings from "@pages/settings/toasterSettings";

import AdvancedViewSettings from "./advancedViewSettings";
import { LanguageSettings } from "./langSettings";

export default function Settings() {
    const { query } = useSettings();

    const { data: settingsState, error, isPending, isError } = query;
    if (isError) throw error;
    if (isPending) return <Spinner />;

    return (
        <>
            <div className="flex flex-col gap-2 px-3 py-2">
                <LanguageSettings />
                <FieldSeparator />
                <ToasterSettings settingsState={settingsState} />
                <FieldSeparator />
                <AdvancedViewSettings settingsState={settingsState} />
            </div>

            <FieldSeparator />
            <SettingsFooter />
        </>
    );
}
