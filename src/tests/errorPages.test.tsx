import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { AppProviders } from "@layouts/appProviders";
import DashboardErrorPage from "@pages/dashboard/shared/dashboardError";
import SettingsErrorPage from "@pages/settings/settingsError";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router";

import { setLanguage } from "@/i18n/language";

import { installDomEnv } from "./domEnv";

describe("SettingsErrorPage and DashboardErrorPage", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;
    let host: HTMLDivElement | undefined;

    beforeEach(async () => {
        cleanupDom = installDomEnv();
        await setLanguage("en");
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    });

    afterEach(async () => {
        if (root) {
            const activeRoot = root;
            root = undefined;
            await act(async () => {
                activeRoot.unmount();
            });
        }
        host = undefined;
        await setLanguage("en");
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    async function render(node: ReactNode) {
        await act(async () => {
            root?.render(
                <AppProviders>
                    <MemoryRouter>{node}</MemoryRouter>
                </AppProviders>,
            );
        });
    }

    test("SettingsErrorPage renders borderless error boundary with retry action", async () => {
        await render(<SettingsErrorPage error={new Error("Storage read failed")} />);

        const alert = host?.querySelector("[role='alert'][data-error-boundary='true']");
        expect(alert).not.toBeNull();
        expect(alert?.textContent).toContain("Something went wrong");
        expect(alert?.textContent).toContain("Storage read failed");
        expect(alert?.querySelector("button")?.textContent).toContain("Retry");
    });

    test("DashboardErrorPage renders borderless error boundary with retry action", async () => {
        await render(<DashboardErrorPage error={new Error("IndexedDB unavailable")} />);

        const alert = host?.querySelector("[role='alert'][data-error-boundary='true']");
        expect(alert).not.toBeNull();
        expect(alert?.textContent).toContain("Something went wrong");
        expect(alert?.textContent).toContain("IndexedDB unavailable");
        expect(alert?.querySelector("button")?.textContent).toContain("Retry");
    });
});
