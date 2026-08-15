import { Outlet } from "react-router";

export function PopupLayout() {
    return (
        <div className="w-60">
            <Outlet />
        </div>
    );
}
