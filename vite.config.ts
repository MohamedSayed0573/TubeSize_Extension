import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import zip from "vite-plugin-zip-pack";
import path from "node:path";
import manifest from "./manifest.config.js";
import { name, version } from "./package.json";

const __dirname = import.meta.dirname;
export default defineConfig(({ mode }) => ({
    server: {
        cors: {
            origin: [/^chrome-extension:\/\//],
        },
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "src"),
            "@components": path.resolve(__dirname, "src/components"),
            "@styles": path.resolve(__dirname, "src/styles"),
            "@pages": path.resolve(__dirname, "src/pages"),
            "@lib": path.resolve(__dirname, "src/lib"),
            "@tests": path.resolve(__dirname, "src/tests"),
            "@assets": path.resolve(__dirname, "src/assets"),
            "@hooks": path.resolve(__dirname, "src/hooks"),
            "@app-types": path.resolve(__dirname, "src/types"),
        },
    },
    plugins: [
        react(),
        crx({ manifest }),
        zip({ outDir: "release", outFileName: `crx-${name}-${version}.zip` }),
    ],
    build: {
        sourcemap: mode === "development",
        chunkSizeWarningLimit: 700,
    },
}));
