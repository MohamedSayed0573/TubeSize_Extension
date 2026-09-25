import { Navigate, createHashRouter } from "react-router";
import Popup from "@pages/popup/popup";
import Settings from "@pages/settings/settings";
import Spinner from "@components/spinner";
import { PopupLayout } from "@layouts/popupLayout";
import DashboardLayout from "@layouts/dashboardLayout";
import {
    DashboardRouteErrorElement,
    PopupRouteErrorElement,
    SettingsRouteErrorElement,
} from "./routeErrorElements";

const dashboardLoadingFallback = (
    <div className="flex h-screen w-full items-center justify-center">
        <Spinner />
    </div>
);

export const router = createHashRouter([
    {
        path: "/",
        element: <PopupLayout />,
        errorElement: <PopupRouteErrorElement />,
        children: [
            {
                index: true,
                element: <Popup />,
            },
        ],
    },
    {
        path: "/settings",
        element: <Settings />,
        errorElement: <SettingsRouteErrorElement />,
    },
    {
        path: "/dashboard",
        element: <DashboardLayout />,
        hydrateFallbackElement: dashboardLoadingFallback,
        errorElement: <DashboardRouteErrorElement />,
        children: [
            {
                index: true,
                element: <Navigate to="daily" replace />,
            },
            {
                path: "daily",
                lazy: async () => {
                    const { default: Dashboard } =
                        await import("@pages/dashboard/overview/dashboard");
                    return { Component: () => <Dashboard chart="daily" /> };
                },
            },
            {
                path: "sites",
                lazy: async () => {
                    const { default: Dashboard } =
                        await import("@pages/dashboard/overview/dashboard");
                    return { Component: () => <Dashboard chart="sites" /> };
                },
            },
            {
                path: ":date",
                lazy: async () => {
                    const { default: Component } = await import("@pages/dashboard/scope/scopePage");
                    return { Component };
                },
            },
            {
                path: "platform/:platformId",
                lazy: async () => {
                    const { default: Component } =
                        await import("@pages/dashboard/platform/platformUsage");
                    return { Component };
                },
            },
            {
                path: "site/:siteName",
                lazy: async () => {
                    const { default: Component } =
                        await import("@pages/dashboard/scope/siteDetailPage");
                    return { Component };
                },
            },
            {
                path: "*",
                lazy: async () => {
                    const { default: Component } = await import("@pages/dashboard/shared/notFound");
                    return { Component };
                },
            },
        ],
    },
]);
