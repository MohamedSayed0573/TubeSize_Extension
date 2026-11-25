import { describe, expect, test } from "bun:test";

import { storage } from "@wxt-dev/storage";

import { runMigrations } from "@/entrypoints/background/migrations";

describe("runMigrations", () => {
    test("removes legacy sync:qualityIds while preserving active sync settings", async () => {
        await storage.setItem("sync:qualityIds", [399, 248]);
        await storage.setItem("sync:toasterEnabled", false);
        await storage.setItem("sync:language", "ar");

        await runMigrations();

        expect(await storage.getItem("sync:qualityIds")).toBeNull();
        expect(await storage.getItem("sync:toasterEnabled")).toBe(false);
        expect(await storage.getItem("sync:language")).toBe("ar");
    });

    test("succeeds idempotently when legacy keys are already absent", async () => {
        await runMigrations();
        expect(await storage.getItem("sync:qualityIds")).toBeNull();
    });
});
