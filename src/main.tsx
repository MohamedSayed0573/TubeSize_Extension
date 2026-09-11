import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "react-error-boundary";
import { Routes, Route, HashRouter, Navigate } from "react-router";
import Popup from "@pages/popup/popup";
import Options from "@pages/options/options";
import Dashboard from "@pages/dashboard/overview/dashboard";
import { ScopePage } from "@pages/dashboard/scope/scopePage";
import PlatformUsage from "@pages/dashboard/platform/platformUsage";
import DashboardErrorPage from "@pages/dashboard/shared/dashboardError";
import PopupErrorPage from "@pages/popup/popupError";
import DashboardNotFound from "@pages/dashboard/shared/notFound";
import OptionsErrorPage from "@pages/options/optionsError";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { PopupLayout } from "@layouts/popupLayout";
import DashboardLayout from "@layouts/dashboardLayout";
import { SiteDetailPage } from "@pages/dashboard/scope/siteDetailPage";

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
                                <ErrorBoundary FallbackComponent={PopupErrorPage}>
                                    <Popup />
                                </ErrorBoundary>
                            }
                        />
                    </Route>

                    <Route
                        path="/options"
                        element={
                            <ErrorBoundary FallbackComponent={OptionsErrorPage}>
                                <Options />
                            </ErrorBoundary>
                        }
                    />

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
                        <Route path=":date" element={<ScopePage />} />
                        <Route path="platform/:platformId" element={<PlatformUsage />} />
                        <Route path="site/:siteName" element={<SiteDetailPage />} />
                        <Route path="*" element={<DashboardNotFound />} />
                    </Route>
                </Routes>
            </HashRouter>
        </QueryClientProvider>
    </StrictMode>,
);
