import { createHashRouter } from "react-router";
import Popup from "@pages/popup/popup";
import { PopupLayout } from "@layouts/popupLayout";
import { PopupRouteErrorElement, SettingsRouteErrorElement } from "./routeErrorElements";
import SettingsLayout from "@/layouts/settingsLayout";

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
