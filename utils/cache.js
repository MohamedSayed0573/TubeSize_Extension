const CONFIG = require("../config/constants");
const env = require("./env");

const Redis = require("ioredis");
const redisClient = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
});

redisClient.on("error", () => {});

async function checkCache(videoTag) {
    try {
        if (redisClient.status !== "connect") return;
        return await redisClient.get(videoTag);
    } catch (err) {
        // Cache miss on error — request continues without cache
    }
}

async function setCache(videoTag, data) {
    try {
        if (redisClient.status !== "connect") return;
        await redisClient.set(videoTag, data, "PX", CONFIG.CACHE_TTL, "NX");
    } catch (err) {
        // Cache write failure — non-critical, request still succeeds
    }
}

module.exports = {
    redisClient,
    checkCache,
    setCache,
};
