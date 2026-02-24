import type { Request, Response, NextFunction } from "express";

import env from "./utils/env";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import ms from "ms";

import { AppError, RateLimit } from "./utils/errors";
import apiRoutes from "./routes/api";
import { rateLimit } from "express-rate-limit";
import { logger, pinoHttp } from "./utils/logger";
import { redis } from "./utils/cache";
import CONFIG from "./config/constants";

const app = express();

app.use(cors());

app.set("trust proxy", 1); // Trust the first proxy hop (e.g. Docker/Nginx/AWS) to prevent rate-limit spoofing

// Apply helmet middleware to all requests.
app.use(helmet({ crossOriginResourcePolicy: false }));

const limiter = rateLimit({
    windowMs: CONFIG.WINDOW_LIMIT_MS, // Time frame for which requests are checked/remembered
    limit: CONFIG.LIMIT, // Number of requests allowed in the time frame
    handler: () => {
        throw new RateLimit("Too many requests, please try again later.");
    },
});

// Apply the rate limiting middleware to all requests.
app.use(limiter);

app.use(pinoHttp);

// Routes
app.use("/api", apiRoutes);

app.get("/health", (req: Request, res: Response) => {
    res.json({
        status: "ok",
        uptime: ms(Math.round(process.uptime()) * 1000),
        timestamp: new Date().toISOString(),
        redisStatus: redis.status,
        ytdlpVersion: CONFIG.YTDLP_VERSION,
    });
});

app.use((req: Request, res: Response) => {
    res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    req.log.error(err);

    const status = err instanceof AppError ? err.statusCode : 500;
    const message =
        err instanceof AppError ? err.message : "Internal Server Error";

    if (env.NODE_ENV === "production") {
        res.status(status).json({
            success: false,
            error: message,
        });
    } else {
        res.status(status).json({
            success: false,
            error: message,
            ERRORS: (err as any).errors,
            stack: err.stack,
        });
    }
});

const server = app.listen(env.PORT, async () => {
    if (env.REDIS_ENABLED) {
        if (redis.status === "ready" || redis.status === "connecting") {
            logger.info("Redis connection initialized");
        } else {
            logger.warn("Redis is not ready, caching may be disabled");
        }
    }
    logger.info(`Server is running on port ${env.PORT}`);
});

async function gracefulShutdown(signal: string) {
    logger.info(`Server is shutting down (${signal})`);

    server.close(async () => {
        try {
            // We wrap this in try/catch because if redis has already quit, it will throw if you try to quit again
            await redis.quit();
            process.exit(0);
        } catch (_) {}
    });

    setTimeout(() => {
        logger.info(
            `Could not close connections in time, forcefully shutting down`,
        );
        process.exit(1);
    }, CONFIG.SHUTDOWN_TIMEOUT_MS);
}

// SIGINT: Signal Interrupt (Ctrl+C)
process.on("SIGINT", async () => {
    gracefulShutdown("SIGINT");
});

// SIGNTERM: Signal Termination (Kill)
process.on("SIGTERM", async () => {
    gracefulShutdown("SIGTERM");
});

// Uncaught Exception
process.on("uncaughtException", async () => {
    gracefulShutdown("uncaughtException");
});

// Unhandled Promise Rejection. When a promise rejects but there is no catch block to handle it.
process.on("unhandledRejection", async () => {
    gracefulShutdown("unhandledRejection");
});
