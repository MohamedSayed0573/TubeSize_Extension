import env from "./env.js";
import pino from "pino";
import PinoHttp from "pino-http";

export const logger = pino({
    redact: ["req.headers[x-api-key]"],
    level: env.NODE_ENV === "production" ? "info" : "debug",
});
export const pinoHttp = PinoHttp({ logger });
