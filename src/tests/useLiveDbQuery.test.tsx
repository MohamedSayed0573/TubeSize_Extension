import { afterEach, beforeEach, describe, expect, setSystemTime, test } from "bun:test";

import { scopeDepKey, useCurrentDateKey, useLiveDbQuery } from "@hooks/useLiveDbQuery";
import { toDateKey } from "@lib/dateUtils";
import { toOrigin } from "@lib/domain";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { addSiteUsage, clearDatabaseData, getSiteUsage } from "@/db";

import { installDomEnv } from "./domEnv";

function requireDateKey(value: string) {
    const key = toDateKey(value);
    if (!key) throw new Error(`Expected valid DateKey: ${value}`);
    return key;
}

function requireOrigin(url: string) {
    const origin = toOrigin(url);
    if (!origin) throw new Error(`Expected valid Origin: ${url}`);
    return origin;
}

describe("scopeDepKey midnight rollover", () => {
    test("invalidates relative range keys when the calendar day advances", () => {
        const day1 = requireDateKey("2026-05-15");
        const day2 = requireDateKey("2026-05-16");

        for (const range of ["today", "week", "month"] as const) {
            const before = scopeDepKey({ type: "range", range }, day1);
            const after = scopeDepKey({ type: "range", range }, day2);
            expect(before).not.toBe(after);
        }
    });

    test("keeps lifetime, unbounded, and explicit date keys stable across midnight", () => {
        const day1 = requireDateKey("2026-05-15");
        const day2 = requireDateKey("2026-05-16");
        const fixedDate = requireDateKey("2026-05-01");

        expect(scopeDepKey(undefined, day1)).toBe(scopeDepKey(undefined, day2));
        expect(scopeDepKey({ type: "range", range: "lifetime" }, day1)).toBe(
            scopeDepKey({ type: "range", range: "lifetime" }, day2),
        );
        expect(scopeDepKey({ type: "date", date: fixedDate }, day1)).toBe(
            scopeDepKey({ type: "date", date: fixedDate }, day2),
        );
    });
});

function DateHarness() {
    const today = useCurrentDateKey();
    return <output data-testid="date">{today}</output>;
}

async function waitForText(host: HTMLElement, expected: string, maxAttempts = 100): Promise<void> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        if (host.textContent === expected) return;
        await act(async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
        });
    }
    expect(host.textContent).toBe(expected);
}

describe("useLiveDbQuery and useCurrentDateKey React hooks", () => {
    let cleanupDom: (() => Promise<void>) | undefined;
    let root: Root | undefined;

    beforeEach(async () => {
        await clearDatabaseData();
        cleanupDom = installDomEnv();
    });

    afterEach(async () => {
        if (root) {
            const activeRoot = root;
            root = undefined;
            await act(async () => {
                activeRoot.unmount();
            });
        }
        setSystemTime();
        await cleanupDom?.();
        cleanupDom = undefined;
    });

    test("useCurrentDateKey updates rendered DateKey on visibilitychange after midnight", async () => {
        setSystemTime(new Date(2026, 4, 15, 23, 55, 0));

        const host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);

        await act(async () => {
            root?.render(<DateHarness />);
        });

        expect(host.textContent).toBe("2026-05-15");

        setSystemTime(new Date(2026, 4, 16, 0, 5, 0));
        Object.defineProperty(document, "visibilityState", {
            value: "visible",
            configurable: true,
        });

        await act(async () => {
            document.dispatchEvent(new Event("visibilitychange"));
        });

        expect(host.textContent).toBe("2026-05-16");
    });

    test("useLiveDbQuery settles from pending and updates reactively when IndexedDB changes", async () => {
        setSystemTime(new Date(2026, 4, 15, 12, 0, 0));
        const day = requireDateKey("2026-05-15");
        const yt = requireOrigin("https://www.youtube.com");

        function UsageHarness() {
            const result = useLiveDbQuery(() => getSiteUsage(day), [day]);
            if (result.isPending) return <span>pending</span>;
            return <output>{String(result.data?.usage[yt] ?? 0)}</output>;
        }

        const host = document.createElement("div");
        document.body.append(host);
        root = createRoot(host);

        await act(async () => {
            root?.render(<UsageHarness />);
        });

        await waitForText(host, "0");
        expect(host.textContent).toBe("0");

        await act(async () => {
            await addSiteUsage({ [yt]: 12_345 });
        });
        await waitForText(host, "12345");
        expect(host.textContent).toBe("12345");
    });
});
