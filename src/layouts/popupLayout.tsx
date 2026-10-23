import { Outlet } from "react-router";

export function PopupLayout() {
    return (
        <div className="w-full">
            <Outlet />
        </div>
    );
}
