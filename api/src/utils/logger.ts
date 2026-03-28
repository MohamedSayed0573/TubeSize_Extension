import pino from "pino";
import env from "#utils/env";

const logger = pino({
    redact: ["req.headers[x-api-key]"],
    level: env.NODE_ENV === "production" ? "info" : "debug",
});

export default logger;
