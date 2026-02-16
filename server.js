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
const { redisClient } = require("./utils/cache");
const ms = require("ms");

const limiter = rateLimit({
    windowMs: CONFIG.WINDOW_LIMIT_MS, // Time frame for which requests are checked/remembered
    limit: CONFIG.LIMIT, // Number of requests allowed in the time frame
    handler: (req, res, next, options) => {
        throw new RateLimit("Too many requests, please try again later.");
    },
});

// Apply helmet middleware to all requests.
app.use(helmet());

// Apply the rate limiting middleware to all requests.
app.use(limiter);

// Enable CORS for all routes. This is only for development
app.use(cors());

app.use(pinoHttp);

// Routes
app.use("/api", apiRoutes);

app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        uptime: ms(Math.round(process.uptime())),
        timestamp: new Date().toISOString()
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

app.listen(env.PORT, async () => {
    if (env.REDIS_ENABLED) {
        try {
            await redisClient.connect();
            logger.info("Redis connected");
        } catch (error) {
            logger.error(
                { error },
                "Failed to connect to Redis, caching disabled",
            );
        }
    }
    logger.info(`Server is running on port ${env.PORT}`);
});

redisClient.on("error", (error) => {
    logger.error({ error }, "Redis client error");
});

// SIGINT: Signal Interrupt (Ctrl+C)
process.on("SIGINT", async () => {
    // We wrap this in try/catch because if redis has already quit, it will throw if you try to quit again
    try {
        await redisClient.quit();
    } catch (_) {}
    logger.info(`Server is shutting down (SIGINT)`);
    process.exit(0);
});

// SIGNTERM: Signal Termination (Kill)
process.on("SIGTERM", async () => {
    try {
        await redisClient.quit();
    } catch (_) {}
    logger.info("Server is shutting down (SIGTERM)");
    process.exit(0);
});

// Uncaught Exception
process.on("uncaughtException", async (err) => {
    logger.fatal(err);
    try {
        await redisClient.quit();
    } catch (_) {}
    logger.info("Server is shutting down (uncaughtException)");
    process.exit(1);
});

// Unhandled Promise Rejection. When a promise rejects but there is no catch block to handle it.
process.on("unhandledRejection", async (reason) => {
    logger.fatal(reason);
    try {
        await redisClient.quit();
    } catch (_) {}
    logger.info("Server is shutting down (unhandledRejection)");
    process.exit(1);
});
