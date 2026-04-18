const fs = require("fs");
const path = require("path");

const inputManifestPath = process.argv[2] || path.join(__dirname, "..", "manifest.json");
const outputManifestPath =
    process.argv[3] || path.join(__dirname, "..", "dist_firefox", "manifest.json");

function generateManifestFirefox() {
    const rawManifest = fs.readFileSync(inputManifestPath, { encoding: "utf-8" });
    const manifest = JSON.parse(rawManifest);

    if (!manifest.background) manifest.background = {};
    const backgroundScript = manifest.background.service_worker;
    delete manifest.background.service_worker;

    if (backgroundScript) {
        manifest.background.scripts = [backgroundScript];
    }

    manifest.browser_specific_settings = {
        gecko: {
            id: "tubesize@mohammedsayed.dev",
            strict_min_version: "109.0",
        },
    };

    fs.writeFileSync(outputManifestPath, JSON.stringify(manifest, null, 4), {
        encoding: "utf-8",
    });
    console.log(`Generated ${path.relative(path.join(__dirname, ".."), outputManifestPath)}`);
}

generateManifestFirefox();
