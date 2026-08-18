import { createRoot } from "react-dom/client";
import ErrorBoundary from "@components/errorBoundary.tsx";
import ErrorPage from "@pages/error.tsx";
import { Routes, Route, HashRouter } from "react-router";
import Popup from "@pages/popup/popup";
import Options from "@pages/options/options";
import Analytics from "@pages/analytics/analytics";
import { UsageDetails } from "@pages/analytics/usageDetails";
import TodayUsage from "@pages/analytics/todayUsage";
import WeekUsage from "@pages/analytics/weekUsage";
import MonthUsage from "@pages/analytics/monthUsage";
import LifetimeUsage from "@pages/analytics/lifeTimeUsage";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { PopupLayout } from "./layouts/popupLayout";
import AnalyticsLayout from "./layouts/analyticsLayout";

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);
const queryClient = new QueryClient();

root.render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <HashRouter>
                <ErrorBoundary errorComponent={(err) => <ErrorPage errorMessage={err.message} />}>
                    <Routes>
                        <Route path="/" element={<PopupLayout />}>
                            <Route index element={<Popup />} />
                        </Route>

                        <Route path="/options" element={<Options />} />

                        <Route path="/analytics" element={<AnalyticsLayout />}>
                            <Route index element={<Analytics />} />
                            <Route path=":date" element={<UsageDetails />} />
                            <Route path="today" element={<TodayUsage />} />
                            <Route path="week" element={<WeekUsage />} />
                            <Route path="month" element={<MonthUsage />} />
                            <Route path="lifetime" element={<LifetimeUsage />} />
                        </Route>
                    </Routes>
                </ErrorBoundary>
            </HashRouter>
        </QueryClientProvider>
    </StrictMode>,
);
