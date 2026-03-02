import z from "zod";
import dotenv from "dotenv";

dotenv.config({
    path: ".env",
});

const envSchema = z.object({
    PORT: z.coerce
        .number() // Coerces "3000" -> 3000
        .default(3000), // Default is a number
    NODE_ENV: z.enum(["development", "production", "staging"]).default("development"),
    REDIS_ENABLED: z
        .string()
        .transform((val: string) => val.toLowerCase() === "true")
        .default(false), // "true" -> true, anything else -> false
    REDIS_HOST: z.string("Invalid Redis Host").default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),
    EXTENSION_ID: z.string().default(""), // Temporarely optional
});

const env = envSchema.safeParse(process.env);
if (!env.success) {
    console.error("❌ Environment validation failed:");
    // We use console instead of pino to avoid circular dependencies
    console.error(env.error);
    process.exit(1);
}

export default env.data;
