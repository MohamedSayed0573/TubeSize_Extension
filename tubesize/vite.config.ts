import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";
import path from "path";

const isDevelopment = process.env.NODE_ENV === "development";

// https://vite.dev/config/
export default defineConfig({
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@components": path.resolve(__dirname, "src/components"),
            "@styles": path.resolve(__dirname, "src/styles"),
            "@pages": path.resolve(__dirname, "src/pages"),
            "@options": path.resolve(__dirname, "src/options"),
            "@tests": path.resolve(__dirname, "src/tests"),
            "@assets": path.resolve(__dirname, "src/assets"),
            "@app-types": path.resolve(__dirname, "src/types"),
        },
    },
    plugins: [
        react({
            babel: {
                plugins: [["babel-plugin-react-compiler"]],
            },
        }),
        [webExtension({ disableAutoLaunch: true })],
    ],
    build: {
        sourcemap: isDevelopment,
    },
});
