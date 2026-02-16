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
    res.json({ status: "ok" });
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
            error: message,
        });
    } else {
        res.status(status).json({
            error: message,
            ERRORS: err.errors,
            stack: err.stack,
        });
    }
});

app.listen(env.PORT, () => {
    logger.info(`Server is running on port ${env.PORT}`);
});
