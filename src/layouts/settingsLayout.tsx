import SettingsHeader from "@/pages/settings/settingsHeader";
import { Outlet } from "react-router";

export default function SettingsLayout() {
    return (
        <div className="w-72.5">
            <SettingsHeader />
            <Outlet />
        </div>
    );
}
