import Redis from "ioredis";
import CONFIG from "../config/constants";
import env from "./env";
import { logger } from "./logger";

const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    lazyConnect: env.REDIS_ENABLED || false,
});
redis.on("error", (err) => {
    logger.error({ err }, "Redis error");
});

export async function checkCache(videoTag: string) {
    try {
        if (redis.status !== "ready") return;
        return await redis.get(videoTag);
    } catch (err) {
        // Cache miss on error — request continues without cache
    }
}

export async function setCache(videoTag: string, data: any) {
    try {
        if (redis.status !== "ready") return;
        await redis.set(videoTag, data, "PX", CONFIG.CACHE_TTL, "NX");
    } catch (err) {
        // Cache write failure — non-critical, request still succeeds
    }
}
