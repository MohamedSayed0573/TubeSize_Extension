import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "node:path";

const __dirname = import.meta.dirname;

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@components": path.resolve(__dirname, "src/components"),
            "@styles": path.resolve(__dirname, "src/styles"),
            "@pages": path.resolve(__dirname, "src/pages"),
            "@lib": path.resolve(__dirname, "src/lib"),
            "@tests": path.resolve(__dirname, "src/tests"),
            "@assets": path.resolve(__dirname, "src/assets"),
            "@app-types": path.resolve(__dirname, "src/types"),
        },
    },
    plugins: [react(), webExtension({ disableAutoLaunch: true })],
    build: {
        sourcemap: mode === "development",
    },
}));
