import { createRoot } from "react-dom/client";
import ErrorPage from "@pages/error.tsx";
import { ErrorBoundary } from "react-error-boundary";
import { Routes, Route, HashRouter } from "react-router";
import Popup from "@pages/popup/popup";
import Options from "@pages/options/options";
import Analytics from "@pages/analytics/analytics";
import { UsageDetails } from "@pages/analytics/usage/usageDetails";
import RangeUsage from "@pages/analytics/usage/rangeUsage";
import AnalyticsErrorPage from "@pages/analytics/analyticsErrorPage";
import AnalyticsNotFound from "@pages/analytics/analyticsNotFound";
import OptionsErrorPage from "@pages/options/optionsErrorPage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { PopupLayout } from "@layouts/popupLayout";
import AnalyticsLayout from "@layouts/analyticsLayout";
import { OptionsLayout } from "@layouts/optionsLayout";

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
                        path="/analytics"
                        element={
                            <ErrorBoundary FallbackComponent={AnalyticsErrorPage}>
                                <AnalyticsLayout />
                            </ErrorBoundary>
                        }
                    >
                        <Route index element={<Analytics />} />
                        <Route path=":date" element={<UsageDetails />} />
                        <Route path="today" element={<RangeUsage range="today" />} />
                        <Route path="week" element={<RangeUsage range="week" />} />
                        <Route path="month" element={<RangeUsage range="month" />} />
                        <Route path="lifetime" element={<RangeUsage range="lifetime" />} />
                        <Route path="*" element={<AnalyticsNotFound />} />
                    </Route>
                </Routes>
            </HashRouter>
        </QueryClientProvider>
    </StrictMode>,
);
