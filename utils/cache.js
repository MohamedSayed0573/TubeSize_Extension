const CONFIG = require("../config/constants");

const Redis = require("redis");
const redisClient = Redis.createClient({
    socket: {
        host: CONFIG.REDIS_HOST,
        port: CONFIG.REDIS_PORT,
    },
});

async function checkCache(videoTag) {
    try {
        if (!redisClient.isOpen) return;
        return await redisClient.get(videoTag);
    } catch {
        // Cache miss on error — request continues without cache
    }
}

async function setCache(videoTag, data) {
    try {
        if (!redisClient.isOpen) return;
        await redisClient.set(videoTag, data, {
            NX: true,
            PX: CONFIG.CACHE_TTL,
        });
    } catch {
        // Cache write failure — non-critical, request still succeeds
    }
}

module.exports = {
    redisClient,
    checkCache,
    setCache,
};
