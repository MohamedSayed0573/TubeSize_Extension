import { createClient } from "redis";
import CONFIG from "../config/constants";
import env from "./env";
import { logger } from "./logger";
import { Data } from "../types";

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
        console.error("Cache miss on error — request continues without cache", err);
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
        console.error("Cache write failure — non-critical, request still succeeds", err);
    }
}
