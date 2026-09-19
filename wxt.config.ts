import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
    srcDir: "src",
    // Force MV3 for all targets. Firefox defaults to MV2, but this project
    // ships MV3 manifests to Firefox.
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
        // Firefox-only settings. Firefox 121 is the first
        // release with MV3 background service workers enabled by default;
        // below that, background.service_worker in the manifest is invalid.
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "tubesize@mohammedsayed.dev",
                    strict_min_version: "121.0",
                    data_collection_permissions: {
                        required: ["none"],
                    },
                },
            },
        }),
    }),
    vite: (env) => ({
        plugins: [tailwindcss()],
        build: {
            sourcemap: env.mode === "development",
        },
    }),
});
