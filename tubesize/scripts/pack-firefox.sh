#!/bin/sh
# Don't run this file directly. Run it from package.json instead. Because pnpm run build must be run before this script.


# pnpm run build && mkdir -p dist_firefox && cd dist &&
# cp -r * ../dist_firefox && cd ../dist_firefox &&
# cp ../manifest_firefox.json ./manifest.json && zip -r tubesize_firefox.zip .,
set -e
ROOT_DIR=$(cd -- "$(dirname "$0")/.." && pwd)

echo "[pack-firefox] Starting Firefox packaging..."

if [ -d "$ROOT_DIR/dist_firefox" ]; then
    echo "[pack-firefox] Cleaning up existing dist_firefox..."
    rm -rf "$ROOT_DIR/dist_firefox"
fi

echo "[pack-firefox] Copying build output to dist_firefox..."
mkdir -p "$ROOT_DIR/dist_firefox"
cd "$ROOT_DIR/dist"
cp -r * ../dist_firefox
cd ../dist_firefox

if [ -f "$ROOT_DIR/manifest_firefox.json" ]; then
  echo "[pack-firefox] Applying manifest_firefox.json..."
  cp ../manifest_firefox.json ./manifest.json
elif [ -f "$ROOT_DIR/manifest.firefox.json" ]; then
  echo "[pack-firefox] Applying manifest.firefox.json..."
  cp ../manifest.firefox.json ./manifest.json
else
  echo "[pack-firefox] Error: Firefox-specific manifest not found."
  exit 1
fi

echo "[pack-firefox] Creating tubesize_firefox.zip..."
zip -r tubesize_firefox.zip .
echo "[pack-firefox] Done."
