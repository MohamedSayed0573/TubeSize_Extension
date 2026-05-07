import { createRoot } from "react-dom/client";
import Analytics from "@components/analytics/analytics";
import ErrorBoundary from "@components/errorBoundary";
// import ErrorPage from "@pages/error";

const rootEl = document.querySelector("#root") as HTMLElement;
const root = createRoot(rootEl);

root.render(
    <ErrorBoundary errorComponent={() => <div>error</div>}>
        <Analytics />
    </ErrorBoundary>,
);
