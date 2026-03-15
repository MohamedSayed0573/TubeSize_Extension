import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import webExtension from "vite-plugin-web-extension";

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
    define: {
        __API_URL__: JSON.stringify("https://api.mohammedsayed.dev"),
    },
});
