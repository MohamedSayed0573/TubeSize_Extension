import type { FastifyInstance } from "fastify";
import ms from "ms";
import CONFIG from "../config/constants.js";
import { redis } from "../utils/cache.js";
import healthSchema from "../schema/healthSchema.js";

export async function healthRoutes(fastify: FastifyInstance) {
    fastify.get(
        "/health",
        {
            schema: {
                response: {
                    200: healthSchema,
                },
            },
        },
        (req, res) => {
            res.send({
                status: "ok",
                uptime: ms(Math.round(process.uptime()) * 1000),
                timestamp: new Date().toISOString(),
                redisStatus: redis.isReady ? "ready" : redis.isOpen ? "connecting" : "closed",
                ytdlpVersion: CONFIG.YTDLP_VERSION,
            });
        },
    );
}
