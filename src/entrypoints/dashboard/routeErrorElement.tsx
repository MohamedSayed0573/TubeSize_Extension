import DashboardErrorPage from "@pages/dashboard/shared/dashboardError";
import { useRouteError } from "react-router";

export function DashboardRouteErrorElement() {
    const error = useRouteError();
    return <DashboardErrorPage error={error} />;
}
