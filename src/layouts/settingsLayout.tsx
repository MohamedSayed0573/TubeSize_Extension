import { Outlet } from "react-router";

import SettingsHeader from "@/pages/settings/settingsHeader";

export default function SettingsLayout() {
    return (
        <div className="w-72.5">
            <SettingsHeader />
            <Outlet />
        </div>
    );
}
