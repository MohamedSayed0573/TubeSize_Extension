# Extension Project Guidelines

## Project Overview

This workspace contains a Chrome Extension that fetches and displays YouTube video sizes.

## Architecture

- **Flow**: Popup UI -> Background Script -> API -> Response.
- **Communication**: Uses `chrome.runtime.sendMessage` to offload API calls to the background script (avoiding CORS).

## Code Style & Conventions

- **Asynchronous**: Use `async/await` consistently.

## Build & Run

- **Build**: `npm run build` (uses esbuild)
- **Watch**: `npm run watch`

## Key Files

- **Logic**: `background.js`, `popup.js`
