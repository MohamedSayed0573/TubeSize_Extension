import { createTRPCClient, httpBatchLink, retryLink } from "@trpc/client";
import type { AppRouter } from "#routes/api";
import CONFIG from "./constants";
declare const __API_URL__: string;

export const trpc = createTRPCClient<AppRouter>({
    links: [
        retryLink({
            retry(opts) {
                if (opts.error.data && opts.error.data.code !== "INTERNAL_SERVER_ERROR") {
                    // Don't retry on non-500s
                    return false;
                }
                if (opts.op.type !== "query") {
                    // Only retry queries
                    return false;
                }
                // Retry up to 3 times
                return opts.attempts <= CONFIG.DEFAULT_MAX_RETRIES;
            },
            // Double every attempt, with max of 30 seconds (starting at 1 second)
            retryDelayMs: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        }),
        httpBatchLink({
            url: `${__API_URL__}/trpc`,
        }),
    ],
});
