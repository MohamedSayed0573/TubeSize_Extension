import { AppProviders } from "@layouts/appProviders";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";

import "@styles/popup.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { router } from "./router";

const domRoot = document.querySelector("#root");
if (!domRoot) throw new Error("Root element not found");

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
