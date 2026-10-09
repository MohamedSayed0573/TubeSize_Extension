import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import "@styles/dashboard.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { StrictMode } from "react";
import { AppProviders } from "@layouts/appProviders";
import { router } from "./router";

const isArabic = chrome.i18n.getUILanguage().toLowerCase().startsWith("ar");
document.documentElement.lang = isArabic ? "ar" : "en";
document.documentElement.dir = isArabic ? "rtl" : "ltr";

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
