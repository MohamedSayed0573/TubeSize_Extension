import ms from "ms";
import CONFIG from "#config/constants";
import { redis } from "#utils/cache";

import { t } from "../trpc.js";

export const healthRouter = t.router({
    getHealth: t.procedure.query(() => {
        return {
            status: "ok",
            uptime: ms(Math.round(process.uptime()) * 1000),
            timestamp: new Date().toISOString(),
            redisStatus: redis.isReady ? "ready" : redis.isOpen ? "connecting" : "closed",
            ytdlpVersion: CONFIG.YTDLP_VERSION,
        };
    }),
});
