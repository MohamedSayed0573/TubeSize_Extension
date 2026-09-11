import * as z from "zod";
import { isValidDateKey } from "./dashboardUtils";
import type { DateKey } from "@app-types/types";

const SiteUsage = z.object({
    day: z.custom<DateKey>((arg) => typeof arg === "string" && isValidDateKey(arg)),

    // Skip records where
    usage: z.record(z.string(), z.number().nonnegative()).transform((arg) => {
        const out: Record<string, number> = {};
        for (const [key, value] of Object.entries(arg)) {
            const keyResult = z.url().safeParse(key);
            const valueResult = z.number().nonnegative().safeParse(value);
            if (keyResult.success && valueResult.success) {
                out[keyResult.data] = valueResult.data;
            }
        }
        return out;
    }),
});

export const ImportSchema = z.array(SiteUsage);
