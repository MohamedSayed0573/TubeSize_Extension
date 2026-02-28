import { createClient } from "redis";
import CONFIG from "../config/constants";
import env from "./env";
import { logger } from "./logger";

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

export async function checkCache(videoTag: string) {
    try {
        if (!redis.isReady) return;
        return await redis.get(videoTag);
    } catch (err) {
        // Cache miss on error — request continues without cache
    }
}

export async function setCache(videoTag: string, data: any) {
    try {
        if (!redis.isReady) return;
        await redis.set(videoTag, data, {
            PX: CONFIG.CACHE_TTL,
            NX: true,
        });
    } catch (err) {
        // Cache write failure — non-critical, request still succeeds
    }
}
