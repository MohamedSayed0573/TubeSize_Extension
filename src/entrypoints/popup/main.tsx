import { t } from "@/i18n/t";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/popup.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { AppProviders } from "@layouts/appProviders";
import { router } from "./router";

document.documentElement.lang = t("@@ui_locale") || chrome.i18n.getUILanguage();
document.documentElement.dir = t("@@bidi_dir") === "rtl" ? "rtl" : "ltr";

const domRoot = document.querySelector("#root") as HTMLElement;

const root = createRoot(domRoot);
const queryClient = new QueryClient();

root.render(
    <StrictMode>
        <AppProviders>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </AppProviders>
    </StrictMode>,
);
