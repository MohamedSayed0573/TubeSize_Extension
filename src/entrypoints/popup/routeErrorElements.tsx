import { useRouteError } from "react-router";
import PopupErrorPage from "@pages/popup/popupError";
import SettingsErrorPage from "@pages/settings/settingsError";

export function PopupRouteErrorElement() {
    const error = useRouteError();
    return <PopupErrorPage error={error} />;
}

export function SettingsRouteErrorElement() {
    const error = useRouteError();
    return <SettingsErrorPage error={error} />;
}
