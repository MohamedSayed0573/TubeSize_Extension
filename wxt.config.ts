import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import type { Plugin } from "vite";
import { defineConfig } from "wxt";

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
                        gzipSize: true,
                        brotliSize: true,
                    }),
                ],
            };
        },
    };
}

const LOCALE_MESSAGES_RE = /[/\\]public[/\\]_locales[/\\][^/\\]+[/\\]messages\.json$/;

// Locale files in public/_locales/*/messages.json include WebExtension metadata
// (`description`, `placeholders`) that browsers read from public/ directly,
// whereas JS bundles only need `{ message }` for runtime lookups.
function stripLocaleMetadata(): Plugin {
    return {
        name: "strip-locale-metadata",
        enforce: "pre",
        transform(code, id) {
            if (!LOCALE_MESSAGES_RE.test(id)) return null;
            const raw = JSON.parse(code) as Record<string, { message: string }>;
            const stripped: Record<string, { message: string }> = {};
            for (const [key, entry] of Object.entries(raw)) {
                stripped[key] = { message: entry.message };
            }
            return { code: JSON.stringify(stripped), map: null };
        },
    };
}

const shouldEmitStats = process.env.ANALYZE === "true";

export default defineConfig({
    srcDir: "src",
    manifestVersion: 3,
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
        permissions: [
            "activeTab",
            "alarms",
            "downloads",
            "scripting",
            "storage",
            "webRequest",
            ...(browser === "firefox" ? [] : ["favicon"]), // `favicon` is Chromium-only; unknown to Firefox so omitted there.
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
        // Firefox-only settings. Firefox 128 is the first release
        // supporting declarative content_scripts[].world: "MAIN"
        // (used by genericObserver.content.ts).
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "tubesize@mohammedsayed.dev",
                    strict_min_version: "128.0",
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
            ".verify-evidence/**",
            "Notes.md",
            "stats/**",
            "archive/**",
        ],
    },
    vite: (env) => ({
        plugins: [
            stripLocaleMetadata(),
            tailwindcss(),
            ...(shouldEmitStats ? [perEntryVisualizer()] : []),
        ],
        build: {
            sourcemap: env.mode === "development",
        },
    }),
});
