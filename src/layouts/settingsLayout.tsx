import { useLayoutEffect } from "react";
import { Outlet } from "react-router";

import SettingsHeader from "@/pages/settings/settingsHeader";

export default function SettingsLayout() {
    useLayoutEffect(() => {
        document.documentElement.style.width = "290px";
        return () => {
            document.documentElement.style.removeProperty("width");
        };
    }, []);

    return (
        <div className="w-full">
            <SettingsHeader />
            <Outlet />
        </div>
    );
}
