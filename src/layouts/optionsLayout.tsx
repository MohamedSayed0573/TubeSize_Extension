import HeaderOptions from "@pages/options/headerOptions";
import { Outlet } from "react-router";

export function OptionsLayout() {
    return (
        <div className="w-72.5">
            <HeaderOptions />
            <Outlet />
        </div>
    );
}
