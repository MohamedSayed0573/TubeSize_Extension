import type { DateKey, Origin } from "@app-types/types";
import * as z from "zod";

import { isValidDateKey } from "./dateUtils";
import { isOrigin } from "./domain";

const originSchema = z.string().refine(isOrigin, "Invalid origin");

const SiteUsage = z.object({
    day: z.custom<DateKey>((arg) => typeof arg === "string" && isValidDateKey(arg)),
    usage: z.record(originSchema, z.number().nonnegative()),
}) satisfies z.ZodType<{ day: DateKey; usage: Record<Origin, number> }>;

export const ImportSchema = z.array(SiteUsage);
