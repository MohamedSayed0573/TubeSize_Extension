import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import path from "node:path";
import { visualizer } from "rollup-plugin-visualizer";

// WXT runs one Vite/Rollup build per entrypoint (background, each content
// script), except pages (popup, dashboard, ...), which share a single build
// with multiple inputs. Name the stats file after every input in the build
// so no entrypoint's treemap silently hides inside another's file.
function entryNames(input: string | string[] | Record<string, string> | undefined): string[] {
    const files = typeof input === "string" ? [input] : Object.values(input ?? {});
    const names = files.map((file) => {
        const { name, dir } = path.parse(file);
        return (name === "index" ? path.basename(dir) : name) || "bundle";
    });
    return [...new Set(names)];
}

function perEntryVisualizer(): Plugin {
    return {
        name: "per-entry-visualizer",
        options(inputOptions) {
            const plugins = [inputOptions.plugins ?? []].flat();
            return {
                ...inputOptions,
                plugins: [
                    ...plugins,
                    visualizer({
                        filename: path.join(
                            "stats",
                            `${entryNames(inputOptions.input).join("+")}.html`,
                        ),
                    }),
                ],
            };
        },
    };
}

const shouldEmitStats = process.env.ANALYZE === "true";

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
        name: "__MSG_extName__",
        description: "__MSG_extDescription__",
        default_locale: "en",
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
        // `favicon` powers chrome.runtime.getURL("/_favicon/") on Chromium.
        // It is not a valid Firefox permission, so only request it there.
        permissions: [
            "activeTab",
            "storage",
            "webRequest",
            ...(browser === "firefox" ? [] : ["favicon"]),
        ],
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
    zip: {
        excludeSources: [
            "benchmark/**",
            "devTest/**",
            "release/**",
            "coverage/**",
            "Notes.md",
            "stats/**",
        ],
    },
    vite: (env) => ({
        plugins: [tailwindcss(), ...(shouldEmitStats ? [perEntryVisualizer()] : [])],
        build: {
            sourcemap: env.mode === "development",
        },
    }),
});
