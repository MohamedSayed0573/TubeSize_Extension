require("dotenv").config({
    quiet: true,
});
const z = require("zod");

const envSchema = z.object({
    PORT: z.coerce
        .number() // Coerces "3000" -> 3000
        .default(3000), // Default is a number
    NODE_ENV: z
        .enum(["development", "production", "staging"])
        .default("development"),
    // Without nonemptry, Zod would accept "".
    API_KEY: z
        .string()
        .min(10, "API_KEY must be at least 10 characters long")
        .regex(
            /^[a-zA-Z0-9_\-=+@!#$%^&*();:.,?><'"|{}\[\]]+$/,
            "Invalid characters in API key",
        ),
    REDIS_ENABLED: z
        .string()
        .transform((val) => val.toLowerCase() === "true")
        .default("false"), // "true" -> true, anything else -> false
    REDIS_HOST: z.string("Invalid Redis Host").default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),
    EXTENSION_ID: z
        .string()
        .regex(/^[a-zA-Z0-9_\-@.]+$/, "Invalid Extension ID format"),
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
    console.error("❌ Environment validation failed:");
    // We use console instead of pino to avoid circular dependencies
    console.error(env.error);
    process.exit(1);
}

module.exports = env.data;
