import { initTRPC } from "@trpc/server";
import type { Context } from "./context.js";
/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
export const t = initTRPC.context<Context>().create();
