import { useRouteError } from "react-router";
import DashboardErrorPage from "@pages/dashboard/shared/dashboardError";

export function DashboardRouteErrorElement() {
    const error = useRouteError();
    return <DashboardErrorPage error={error} />;
}
