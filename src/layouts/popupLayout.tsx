import { Outlet } from "react-router";

import ChangelogNotice from "@/pages/popup/changelogNotice";

export function PopupLayout() {
    return (
        <div className="w-full">
            <ChangelogNotice />
            <Outlet />
        </div>
    );
}
