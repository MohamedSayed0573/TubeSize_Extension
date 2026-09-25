import { useRouteError } from "react-router";
import DashboardErrorPage from "@pages/dashboard/shared/dashboardError";
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

export function DashboardRouteErrorElement() {
    const error = useRouteError();
    return <DashboardErrorPage error={error} />;
}
