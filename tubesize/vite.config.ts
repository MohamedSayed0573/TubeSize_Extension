import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

const isDevelopment = process.env.NODE_ENV === "development";

// https://vite.dev/config/
export default defineConfig({
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
