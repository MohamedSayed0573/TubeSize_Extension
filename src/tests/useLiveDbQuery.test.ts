import { describe, expect, test } from "bun:test";

import { scopeDepKey } from "@hooks/useLiveDbQuery";
import { toDateKey } from "@lib/dateUtils";

function requireDateKey(value: string) {
    const key = toDateKey(value);
    if (!key) throw new Error(`Expected valid DateKey: ${value}`);
    return key;
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
