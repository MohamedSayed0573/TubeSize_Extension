import { Outlet } from "react-router";

export default function AnalyticsLayout() {
    return (
        <div className="flex h-screen w-full flex-col">
            <Outlet />
        </div>
    );
}
