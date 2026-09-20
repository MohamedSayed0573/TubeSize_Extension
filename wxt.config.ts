import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin } from "vite";
import path from "node:path";
import { visualizer } from "rollup-plugin-visualizer";

// WXT runs one Vite/Rollup build per entrypoint (popup pages, background,
// each content script), and every build would otherwise overwrite the same
// stats.html — last writer wins, which is why only the popup showed up.
// This attaches a fresh visualizer per build, named after its entry.
function entryName(input: string | string[] | Record<string, string> | undefined): string {
    const first = Array.isArray(input)
        ? input[0]
        : typeof input === "object"
          ? Object.values(input)[0]
          : input;
    if (typeof first !== "string" || !first) return "bundle";
    return path.parse(first).name.replaceAll(/[^a-zA-Z0-9]+/g, "-");
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
                    visualizer({ filename: `stats-${entryName(inputOptions.input)}.html` }),
                ],
            };
        },
    };
}

// Stats are on-demand tooling, not a build artifact: they would otherwise land
// in the project root on every release build. Generate with `pnpm analyze`.
// (Gating on dev mode is not an option — WXT's dev server never runs the
// rollup step the visualizer hooks into.)
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
    // The Firefox sources zip (uploaded to AMO for review) is built by globbing
    // the whole project root — WXT does not honor .gitignore, so everything not
    // excluded here ships to the store reviewers. Only dotfiles are excluded by
    // default (which keeps .env/.env.submit out).
    zip: {
        excludeSources: [
            "benchmark/**",
            "devTest/**",
            "release/**",
            "coverage/**",
            "Notes.md",
            "stats*.html",
        ],
    },
    vite: (env) => ({
        plugins: [tailwindcss(), ...(shouldEmitStats ? [perEntryVisualizer()] : [])],
        build: {
            sourcemap: env.mode === "development",
        },
    }),
});
