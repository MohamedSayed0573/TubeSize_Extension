import { createRoot } from "react-dom/client";
import ErrorBoundary from "@components/errorBoundary.tsx";
import ErrorPage from "@pages/error.tsx";
import { Routes, Route, HashRouter } from "react-router";
import Popup from "@pages/popup";
import Options from "@pages/options";
import Analytics from "@components/analytics/analytics";
import { UsageDetails } from "@components/analytics/usageDetails";
import TodayUsage from "@components/analytics/todayUsage";
import WeekUsage from "@components/analytics/weekUsage";
import MonthUsage from "@components/analytics/monthUsage";
import LifetimeUsage from "@components/analytics/lifeTimeUsage";

import "@styles/global.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);

root.render(
    <StrictMode>
        <HashRouter>
            <ErrorBoundary errorComponent={(err) => <ErrorPage errorMessage={err.message} />}>
                <Routes>
                    <Route path="/" element={<Popup />} />
                    <Route path="/options" element={<Options />} />
                    <Route path="/analytics" element={<Analytics />} />
                    <Route path="/analytics/:date" element={<UsageDetails />} />
                    <Route path="/today" element={<TodayUsage />} />
                    <Route path="/week" element={<WeekUsage />} />
                    <Route path="/month" element={<MonthUsage />} />
                    <Route path="/lifetime" element={<LifetimeUsage />} />
                </Routes>
            </ErrorBoundary>
        </HashRouter>
    </StrictMode>,
);
