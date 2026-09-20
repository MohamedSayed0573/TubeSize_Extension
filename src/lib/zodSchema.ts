import * as z from "zod";
import { isValidDateKey } from "./dateUtils";
import type { DateKey } from "@app-types/types";

const SiteUsage = z.object({
    day: z.custom<DateKey>((arg) => typeof arg === "string" && isValidDateKey(arg)),
    usage: z.record(z.string(), z.number().nonnegative()),
});

export const ImportSchema = z.array(SiteUsage);
