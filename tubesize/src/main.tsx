import { createRoot } from "react-dom/client";
import ErrorBoundary from "@components/errorBoundary.tsx";
import ErrorPage from "@pages/error.tsx";
import { Routes, Route, HashRouter } from "react-router";
import Popup from "@pages/popup";
import Options from "./pages/options";
import Analytics from "./components/analytics/analytics";
import { UsageDetails } from "./components/analytics/usageDetails";

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);

root.render(
    <HashRouter>
        <ErrorBoundary errorComponent={(err) => <ErrorPage errorMessage={err.message} />}>
            <Routes>
                <Route path="/" element={<Popup />} />
                <Route path="/options" element={<Options />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/analytics/:date" element={<UsageDetails />} />
            </Routes>
        </ErrorBoundary>
    </HashRouter>,
);
