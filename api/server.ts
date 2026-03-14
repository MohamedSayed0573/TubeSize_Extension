import type { FastifyRequest, FastifyReply } from "fastify";

import env from "./utils/env.js";
import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compression from "@fastify/compress";
import swagger from "@fastify/swagger";
import swaggerUI from "@fastify/swagger-ui";

import {
    jsonSchemaTransform,
    serializerCompiler,
    validatorCompiler,
} from "fastify-type-provider-zod";

import { AppError, NotFoundError } from "./utils/errors.js";
import apiRoutes from "./routes/api.js";
import { redis } from "./utils/cache.js";
import logger from "./utils/logger.js";
import CONFIG from "./config/constants.js";
import { healthRoutes } from "./routes/health.js";

const fastify = Fastify({
    loggerInstance: logger,
    trustProxy: 1,
});

fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

fastify.register(cors, {
    origin: `chrome-extension://${env.EXTENSION_ID}`,
});

fastify.register(compression, {
    global: true,
    threshold: 1024, // Only compress if payload is > 1KB
});

// Apply helmet middleware to all requests.
fastify.register(helmet, { crossOriginResourcePolicy: false });

// API Documentation
fastify.register(swagger, {
    transform: jsonSchemaTransform,
    openapi: {
        info: {
            title: "TubeSize API",
            version: CONFIG.API_VERSION,
            description:
                "Backend API for the TubeSize Chrome extension, providing endpoints to fetch file size data for YouTube videos across different quality levels.",
            contact: {
                name: "Mohamed Sayed",
            },
        },
    },
});

fastify.get("/api-docs/spec.json", (req: FastifyRequest, res: FastifyReply) => {
    res.send(fastify.swagger());
});

fastify.register(swaggerUI, {
    routePrefix: "/api-docs/swagger",
    logLevel: "silent",
});

// Routes
fastify.register(healthRoutes);
fastify.register(apiRoutes, { prefix: "/api" });

fastify.setNotFoundHandler(() => {
    throw new NotFoundError("Route not found");
});

// Error handler
fastify.setErrorHandler((err: Error, req: FastifyRequest, res: FastifyReply) => {
    const status = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof AppError ? err.message : "Internal Server Error";

    if (env.NODE_ENV === "production") {
        res.status(status).send({
            success: false,
            error: message,
        });
    } else {
        res.status(status).send({
            success: false,
            error: message,
            ERRORS: "errors" in err ? err.errors : undefined,
            stack: err.stack,
        });
    }
});

await fastify.listen({ port: env.PORT, host: "0.0.0.0" });

if (env.REDIS_ENABLED) {
    if (redis.isReady || redis.isOpen) {
        logger.info("Redis connection initialized");
    } else {
        logger.warn("Redis is not ready, caching may be disabled");
    }
}
logger.info(`fastify is running on port ${env.PORT}`);

async function gracefulShutdown(signal: string) {
    logger.info(`fastify is shutting down (${signal})`);

    const shutdownTimer = setTimeout(() => {
        logger.info(`Could not close connections in time, forcefully shutting down`);
        process.exit(1);
    }, CONFIG.SHUTDOWN_TIMEOUT_MS);

    await fastify.close();
    clearTimeout(shutdownTimer);
    try {
        if (redis.isReady && redis.isOpen) await redis.quit();
    } catch (_) {}
    process.exit(0);
}

// SIGINT: Signal Interrupt (Ctrl+C)
process.on("SIGINT", async () => {
    await gracefulShutdown("SIGINT");
});

// SIGNTERM: Signal Termination (Kill)
process.on("SIGTERM", async () => {
    await gracefulShutdown("SIGTERM");
});

// Uncaught Exception
process.on("uncaughtException", async () => {
    await gracefulShutdown("uncaughtException");
});

// Unhandled Promise Rejection. When a promise rejects but there is no catch block to handle it.
process.on("unhandledRejection", async () => {
    await gracefulShutdown("unhandledRejection");
});
