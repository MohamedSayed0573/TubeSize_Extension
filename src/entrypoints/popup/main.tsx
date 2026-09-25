import { createRoot } from "react-dom/client";
import { Navigate, RouterProvider, createHashRouter } from "react-router";
import Popup from "@pages/popup/popup";
import Settings from "@pages/settings/settings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { PopupLayout } from "@layouts/popupLayout";
import DashboardLayout from "@layouts/dashboardLayout";
import { AppProviders } from "@layouts/appProviders";
import { startDocumentLanguageSync, syncAppLang } from "@/i18n/i18n";
import {
    DashboardRouteErrorElement,
    PopupRouteErrorElement,
    SettingsRouteErrorElement,
} from "./routeErrorElements";

void syncAppLang();
startDocumentLanguageSync();

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);
const queryClient = new QueryClient();

const router = createHashRouter([
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

root.render(
    <StrictMode>
        <AppProviders>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </AppProviders>
    </StrictMode>,
);
