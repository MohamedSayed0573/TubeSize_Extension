require("dotenv").config({
    quiet: true,
});
const z = require("zod");
const logger = require("./logger");

const envSchema = z.object({
    PORT: z
        .string()
        .default("3000")
        .regex(/^[0-9]+$/, "PORT must be a number")
        .transform(Number),
    NODE_ENV: z.enum(["development", "production"]).default("development"),
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
    logger.fatal("❌ Environment validation failed:");
    logger.fatal(env.error);
    process.exit(1);
}

module.exports = env.data;
