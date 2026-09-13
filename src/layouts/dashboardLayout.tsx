import { Outlet } from "react-router";

export default function DashboardLayout() {
    return (
        <div className="font- flex h-screen w-full flex-col">
            <Outlet />
        </div>
    );
}
