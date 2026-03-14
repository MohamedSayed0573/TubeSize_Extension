import env from "./env.js";
import pino from "pino";

const logger = pino({
    redact: ["req.headers[x-api-key]"],
    level: env.NODE_ENV === "production" ? "info" : "debug",
});

export default logger;
