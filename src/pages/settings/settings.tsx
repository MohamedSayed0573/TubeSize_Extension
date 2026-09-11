import ToasterSettings from "@pages/settings/toasterSettings";
import useSettings from "@hooks/useSettings";
import Divider from "@pages/settings/divider";
import { SettingsFooter } from "@pages/settings/settingsFooter";
import ResolutionsSettings from "@pages/settings/resolutionsSettings";
import Spinner from "@components/spinner";
import HeaderSettings from "./headerSettings";

export default function Settings() {
    const { query } = useSettings();

    const { data: settingsState, error, isPending, isError } = query;
    if (isError) throw error;
    if (isPending) return <Spinner />;

    return (
        <div className="w-72.5">
            <HeaderSettings />

            <ResolutionsSettings settingsState={settingsState} />

            <Divider />
            <ToasterSettings settingsState={settingsState} />

            <Divider />
            <SettingsFooter />
        </div>
    );
}
