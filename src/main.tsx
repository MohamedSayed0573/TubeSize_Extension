import { createRoot } from "react-dom/client";
import ErrorPage from "@pages/error.tsx";
import { ErrorBoundary } from "react-error-boundary";
import { Routes, Route, HashRouter, Navigate } from "react-router";
import Popup from "@pages/popup/popup";
import Options from "@pages/options/options";
import Dashboard from "@pages/dashboard/dashboard";
import { UsageScopePage } from "@pages/dashboard/usage/usageScopePage";
import PlatformUsage from "@pages/dashboard/platform/platformUsage";
import DashboardErrorPage from "@pages/dashboard/dashboardErrorPage";
import DashboardNotFound from "@pages/dashboard/dashboardNotFound";
import OptionsErrorPage from "@pages/options/optionsErrorPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { PopupLayout } from "@layouts/popupLayout";
import DashboardLayout from "@layouts/dashboardLayout";
import { OptionsLayout } from "@layouts/optionsLayout";
import { WebsiteUsage } from "@pages/dashboard/websiteUsage";

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);
const queryClient = new QueryClient();

root.render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <HashRouter>
                <Routes>
                    <Route path="/" element={<PopupLayout />}>
                        <Route
                            index
                            element={
                                <ErrorBoundary FallbackComponent={ErrorPage}>
                                    <Popup />
                                </ErrorBoundary>
                            }
                        />
                    </Route>

                    <Route path="/options" element={<OptionsLayout />}>
                        <Route
                            index
                            element={
                                <ErrorBoundary FallbackComponent={OptionsErrorPage}>
                                    <Options />
                                </ErrorBoundary>
                            }
                        />
                    </Route>

                    <Route
                        path="/dashboard"
                        element={
                            <ErrorBoundary FallbackComponent={DashboardErrorPage}>
                                <DashboardLayout />
                            </ErrorBoundary>
                        }
                    >
                        <Route index element={<Navigate to="daily" replace />} />
                        <Route path="daily" element={<Dashboard chart={"daily"} />} />
                        <Route path="sites" element={<Dashboard chart={"sites"} />} />
                        <Route path=":date" element={<UsageScopePage />} />
                        <Route path="platform/:platformId" element={<PlatformUsage />} />
                        <Route path="site/:siteName" element={<WebsiteUsage />} />
                        <Route path="*" element={<DashboardNotFound />} />
                    </Route>
                </Routes>
            </HashRouter>
        </QueryClientProvider>
    </StrictMode>,
);
