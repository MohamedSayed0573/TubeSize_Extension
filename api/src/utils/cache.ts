import { createClient } from "redis";
import CONFIG from "@config/constants";
import type { Data } from "@app-types/types";
import env from "@utils/env";
import logger from "@utils/logger";

export const redis = createClient({
    socket: {
        host: env.REDIS_HOST,
        port: env.REDIS_PORT,
    },
});

redis.on("error", (err: any) => {
    logger.error({ err }, "Redis error");
});

if (env.REDIS_ENABLED) {
    redis.connect().catch((err: any) => logger.error({ err }, "Failed to connect to Redis"));
}

export async function checkCache(videoTag: string): Promise<Data | undefined> {
    try {
        if (!redis.isReady) return;
        const cached = await redis.get(videoTag);
        if (!cached) return;
        return JSON.parse(cached);
    } catch (err) {
        logger.error(err, "Cache miss on error — request continues without cache");
    }
}

export async function setCache(videoTag: string, data: Data) {
    try {
        if (!redis.isReady) return;
        await redis.set(videoTag, JSON.stringify(data), {
            PX: CONFIG.CACHE_TTL,
            NX: true,
        });
    } catch (err) {
        logger.error(err, "Cache write failure — non-critical, request still succeeds");
    }
}
