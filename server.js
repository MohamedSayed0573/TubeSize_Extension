const env = require("./utils/env");
const express = require("express");
const cors = require("cors");
const app = express();
const { AppError, RateLimit } = require("./utils/errors");
const apiRoutes = require("./routes/api");
const { rateLimit } = require("express-rate-limit");
const helmet = require("helmet");
const CONFIG = require("./config/constants");
const { logger, pinoHttp } = require("./utils/logger");
const { redis } = require("./utils/cache");
const ms = require("ms");
const authMiddleware = require("./middleware/auth");

app.use(
    cors({
        origin: [
            `chrome-extension://${env.EXTENSION_ID}`,
            `moz-extension://${env.EXTENSION_ID}`,
        ],
    }),
);

app.set("trust proxy", true);

// Apply helmet middleware to all requests.
app.use(helmet({ crossOriginResourcePolicy: false }));

const limiter = rateLimit({
    windowMs: CONFIG.WINDOW_LIMIT_MS, // Time frame for which requests are checked/remembered
    limit: CONFIG.LIMIT, // Number of requests allowed in the time frame
    handler: (req, res, next, options) => {
        throw new RateLimit("Too many requests, please try again later.");
    },
});

// Apply the rate limiting middleware to all requests.
app.use(limiter);

app.use(pinoHttp);

// Routes
app.use("/api", authMiddleware, apiRoutes);

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: ms(Math.round(process.uptime()) * 1000),
        timestamp: new Date().toISOString(),
        redisStatus: redis.status,
        ytdlpVersion: CONFIG.YTDLP_VERSION,
    });
});

app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Error handler
app.use((err, req, res, next) => {
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
            ERRORS: err.errors,
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

async function gracefulShutdown(signal) {
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
process.on("uncaughtException", async (err) => {
    gracefulShutdown("uncaughtException");
});

// Unhandled Promise Rejection. When a promise rejects but there is no catch block to handle it.
process.on("unhandledRejection", async (reason) => {
    gracefulShutdown("unhandledRejection");
});
