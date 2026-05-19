import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
    manifest_version: 3,
    name: "TubeSize",
    version: pkg.version,
    description: "View file size data for YouTube videos across different quality levels.",
    icons: {
        "16": "public/icons/icon-16.png",
        "32": "public/icons/icon-32.png",
        "48": "public/icons/icon-48.png",
        "128": "public/icons/icon-128.png",
    },
    action: {
        default_icon: {
            48: "public/icons/icon-48.png",
        },
        default_popup: "index.html",
    },
    content_scripts: [
        {
            matches: ["https://*.youtube.com/*", "https://*.twitch.tv/*", "https://*.kick.com/*"],
            js: ["src/content.ts"],
        },
        {
            matches: ["https://*.youtube.com/*"],
            js: ["src/observer.ts"],
        },
    ],
    background: {
        service_worker: "src/background.ts",
    },
    host_permissions: [
        "https://*.youtube.com/*",
        "https://*.twitch.tv/*",
        "https://gql.twitch.tv/*",
        "https://usher.ttvnw.net/*",
        "https://*.playlist.ttvnw.net/v1/playlist/*",
        "https://*.cloudfront.hls.ttvnw.net/v1/segment/*",
        "https://*.kick.com/*",
        "https://*.playback.live-video.net/*",
        "https://*.cloudfront.hls.live-video.net/v1/*",
    ],
    permissions: ["activeTab", "storage"],
    commands: {
        _execute_action: {
            suggested_key: {
                default: "Alt+P",
                mac: "Alt+P",
            },
            description: "Open the TubeSize popup",
        },
    },
});
