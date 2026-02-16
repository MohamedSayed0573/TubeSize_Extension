require("dotenv").config({
    quiet: true,
});
const z = require("zod");
const { logger } = require("./logger");

const envSchema = z.object({
    PORT: z.coerce
        .number()       // Coerces "3000" -> 3000
        .default(3000), // Default is a number
    NODE_ENV: z.enum(["development", "production"]).default("development"),
    REDIS_ENABLED: z.coerce.boolean().default(false), // Coerces "true" -> true
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
    logger.fatal("❌ Environment validation failed:");
    logger.fatal(env.error);
    process.exit(1);
}

module.exports = env.data;
