import type { DateKey, Origin } from "@app-types/types";
import { z } from "zod";

import { isValidDateKey } from "./dateUtils";
import { isOrigin } from "./domain";

const originSchema = z.string().refine(isOrigin, "Invalid origin");

const siteUsageSchema = z.object({
    day: z.custom<DateKey>((arg) => typeof arg === "string" && isValidDateKey(arg)),
    usage: z.record(originSchema, z.number().nonnegative()),
}) satisfies z.ZodType<{ day: DateKey; usage: Record<Origin, number> }>;

export type SiteUsage = z.infer<typeof siteUsageSchema>;

export const ImportSchema = z.array(siteUsageSchema);
