import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";

import useChangelogNotice from "@hooks/useChangelogNotice";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fakeBrowser } from "@webext-core/fake-browser";
import { storage } from "@wxt-dev/storage";
import { act, Component, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { installDomEnv } from "./domEnv";

class TestErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    override state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    override render() {
        if (this.state.hasError) return <div data-testid="error-boundary">error</div>;
        return this.props.children;
    }
}

function NoticeHarness() {
    const { version, isNewRelease, dismiss } = useChangelogNotice();
    return (
        <div>
            <output data-testid="state">
                {isNewRelease ? `show:${version}` : `hide:${version}`}
            </output>
            <button type="button" onClick={dismiss}>
                Dismiss
            </button>
        </div>
    );
}

async function waitForCondition(check: () => boolean | Promise<boolean>, maxAttempts = 100) {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (await check()) return;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
    expect(await check()).toBe(true);
}

describe("useChangelogNotice", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;
    let queryClient: QueryClient | undefined;
    let host: HTMLDivElement | undefined;
    const spies: Array<{ mockRestore: () => void }> = [];

    beforeEach(() => {
        cleanupDom = installDomEnv();
        fakeBrowser.runtime.getManifest = () =>
            ({ version: "3.0.4" }) as ReturnType<typeof fakeBrowser.runtime.getManifest>;
        queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, gcTime: 0 },
                mutations: { retry: false, gcTime: 0 },
            },
        });
        host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);
    });

    afterEach(async () => {
        for (const spy of spies.splice(0)) {
            spy.mockRestore();
        }
        if (root) {
            const activeRoot = root;
            root = undefined;
            await act(async () => {
                activeRoot.unmount();
            });
        }
        queryClient?.clear();
        queryClient = undefined;
        await new Promise((resolve) => setTimeout(resolve, 0));
        host = undefined;
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    async function renderHarness() {
        await act(async () => {
            root?.render(
                <TestErrorBoundary>
                    <QueryClientProvider client={queryClient!}>
                        <NoticeHarness />
                    </QueryClientProvider>
                </TestErrorBoundary>,
            );
        });
    }

    function stateText() {
        return host?.querySelector("[data-testid='state']")?.textContent ?? "";
    }

    test("seeds current version on first install and stays hidden", async () => {
        expect(await storage.getItem<string>("local:lastSeenVersion")).toBeNull();

        await renderHarness();

        await waitForCondition(
            async () => (await storage.getItem<string>("local:lastSeenVersion")) === "3.0.4",
        );
        expect(stateText()).toBe("hide:3.0.4");
    });

    test("stays hidden when lastSeenVersion matches current version", async () => {
        await storage.setItem("local:lastSeenVersion", "3.0.4");

        await renderHarness();

        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(stateText()).toBe("hide:3.0.4");
    });

    test("shows notice on upgrade, hides immediately on dismiss, and persists current version", async () => {
        await storage.setItem("local:lastSeenVersion", "3.0.0");

        await renderHarness();
        await waitForCondition(() => stateText() === "show:3.0.4");

        const realSet = fakeBrowser.storage.local.set.bind(fakeBrowser.storage.local);
        let releaseWrite: (() => void) | undefined;
        const writeGate = new Promise<void>((resolve) => {
            releaseWrite = resolve;
        });

        spies.push(
            spyOn(fakeBrowser.storage.local, "set").mockImplementation((items) =>
                writeGate.then(() => realSet(items)),
            ),
        );

        const button = host?.querySelector("button");
        expect(button).not.toBeNull();

        await act(async () => {
            button?.click();
        });

        // Optimistically hidden before storage write resolves
        expect(stateText()).toBe("hide:3.0.4");
        expect(await storage.getItem<string>("local:lastSeenVersion")).toBe("3.0.0");

        releaseWrite?.();
        await waitForCondition(
            async () =>
                queryClient?.isMutating() === 0 &&
                (await storage.getItem<string>("local:lastSeenVersion")) === "3.0.4",
        );
        expect(stateText()).toBe("hide:3.0.4");
    });

    test("logs storage read errors without triggering an error boundary", async () => {
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        spies.push(consoleErrorSpy);
        spies.push(
            spyOn(fakeBrowser.storage.local, "get").mockImplementation(() =>
                Promise.reject(new Error("storage read failed")),
            ),
        );

        await renderHarness();

        await waitForCondition(() => consoleErrorSpy.mock.calls.length > 0);
        expect(host?.querySelector("[data-testid='error-boundary']")).toBeNull();
        expect(stateText()).toBe("hide:3.0.4");
    });

    test("hides notice and logs storage write errors on dismiss without triggering an error boundary", async () => {
        await storage.setItem("local:lastSeenVersion", "3.0.0");
        const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {});
        spies.push(consoleErrorSpy);

        await renderHarness();
        await waitForCondition(() => stateText() === "show:3.0.4");

        spies.push(
            spyOn(fakeBrowser.storage.local, "set").mockImplementation(() =>
                Promise.reject(new Error("storage write failed")),
            ),
        );

        const button = host?.querySelector("button");
        await act(async () => {
            button?.click();
        });

        await waitForCondition(() => consoleErrorSpy.mock.calls.length > 0);
        expect(host?.querySelector("[data-testid='error-boundary']")).toBeNull();
        expect(stateText()).toBe("hide:3.0.4");
    });
});
