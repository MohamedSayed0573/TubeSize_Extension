import SettingsLayout from "@/layouts/settingsLayout";
import { PopupLayout } from "@layouts/popupLayout";
import Popup from "@pages/popup/popup";
import { createHashRouter } from "react-router";
import { PopupRouteErrorElement, SettingsRouteErrorElement } from "./routeErrorElements";

export const router = createHashRouter([
    {
        path: "/",
        element: <PopupLayout />,
        errorElement: <PopupRouteErrorElement />,
        children: [
            {
                index: true,
                element: <Popup />,
            },
        ],
    },
    {
        path: "/settings",
        element: <SettingsLayout />,
        errorElement: <SettingsRouteErrorElement />,
        children: [
            {
                index: true,
                lazy: async () => {
                    const { default: Settings } = await import("@pages/settings/settings");
                    return { Component: Settings };
                },
            },
        ],
    },
]);
