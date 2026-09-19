import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    srcDir: "src",
    // Force MV3 for all targets. Firefox defaults to MV2, but this project
    // ships MV3 manifests (with event-page style backgrounds) to Firefox.
    manifestVersion: 3,
    // Auto-imports are disabled on purpose: the codebase uses explicit imports
    // everywhere so that Jest (ts-jest) and ESLint keep working unchanged.
    imports: false,
    modules: ["@wxt-dev/module-react"],
    alias: {
        "@": "src",
        "@components": "src/components",
        "@styles": "src/styles",
        "@pages": "src/pages",
        "@lib": "src/lib",
        "@tests": "src/tests",
        "@assets": "src/assets",
        "@hooks": "src/hooks",
        "@app-types": "src/types",
        "@layouts": "src/layouts",
    },
    manifest: ({ browser }) => ({
        name: "TubeSize",
        description: "View file size data for YouTube videos across different quality levels.",
        icons: {
            "16": "icons/icon-16.png",
            "32": "icons/icon-32.png",
            "48": "icons/icon-48.png",
            "128": "icons/icon-128.png",
        },
        action: {
            default_icon: {
                48: "icons/icon-48.png",
            },
        },
        host_permissions: ["<all_urls>"],
        permissions: ["activeTab", "storage", "webRequest", "favicon"],
        commands: {
            _execute_action: {
                suggested_key: {
                    default: "Alt+P",
                    mac: "Alt+P",
                },
                description: "Open the TubeSize popup",
            },
        },
        // Firefox-only settings, previously handled by
        // scripts/generate-firefox-manifest.cjs.
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "tubesize@mohammedsayed.dev",
                    strict_min_version: "115.0",
                    data_collection_permissions: {
                        required: ["none"],
                    },
                },
            },
        }),
    }),
    hooks: {
        "build:manifestGenerated": (wxt, manifest) => {
            // Firefox MV3 does not support service workers before Firefox 121,
            // and the gecko strict_min_version is 115. Rewrite the background
            // service worker into an event-page script (same as the old
            // generate-firefox-manifest.cjs did).
            const background = manifest.background;
            if (background && wxt.config.browser === "firefox" && "service_worker" in background) {
                manifest.background = { scripts: [background.service_worker] };
            }
        },
    },
    vite: (env) => ({
        plugins: [tailwindcss()],
        build: {
            sourcemap: env.mode === "development",
            chunkSizeWarningLimit: 700,
        },
    }),
});
