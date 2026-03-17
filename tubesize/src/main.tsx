import { createRoot } from "react-dom/client";
import Popup from "./pages/popup.tsx";
import ErrorBoundary from "./components/errorBoundary.tsx";
import ErrorPage from "./pages/error.tsx";

const domRoot = document.getElementById("root") as HTMLElement;

const root = createRoot(domRoot);

root.render(
    <ErrorBoundary errorComponent={(err) => <ErrorPage errorMessage={err.message} />}>
        <Popup />
    </ErrorBoundary>,
);
