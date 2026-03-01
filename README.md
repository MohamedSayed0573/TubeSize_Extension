<div align="center">

<img src="icons/icon-128.png" alt="TubeSize Logo" width="96" />

# TubeSize - YouTube Video Size Viewer

**Know exactly how much data a YouTube video will cost you — before you press play.**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

</div>

---

## 🌍 The Problem

In many parts of the world, internet data is a limited and expensive resource. In Egypt, for example, the most common internet plan gives you **140 GB per month** — and that quota disappears fast if you're watching YouTube videos carelessly at high resolutions.

The problem? YouTube doesn't tell you how large a video file actually is before you watch it. You might unknowingly stream a 1080p video that costs you 4 GB of your monthly quota, when a 480p version at 800 MB would have looked just fine.

**TubeSize** solves this by showing you the exact file size for every available resolution — right in your browser toolbar — so you can make an informed choice before hitting play.

---

## ✨ Features

- 📊 **Real-time size data** — Displays the file size for each available resolution (144p through 1440p) for any YouTube video
- 🎵 **Audio included** — Sizes shown are the combined video + audio size, reflecting what YouTube actually downloads
- ⚡ **Smart caching** — Results are cached locally for 7 days, so repeat visits are instant and use zero extra data
- 🔔 **Badge indicator** — A green ✓ badge on the extension icon tells you at a glance that data is ready
- ⚙️ **Customizable display** — Choose exactly which resolutions you want to see via the Options page
- 🔒 **Privacy-first** — No tracking, no analytics, no accounts. Only `activeTab` and `storage` permissions are requested
- 🌐 **Cross-browser** — Built on Manifest V3, compatible with Chrome, Edge, and Firefox

---

## 📸 Screenshots

> _Coming soon — screenshots will be added after store publication._

---

## 🚀 Installation

### From the Browser Store _(coming soon)_

| Browser | Link                             |
| ------- | -------------------------------- |
| Chrome  | Chrome Web Store _(coming soon)_ |
| Edge    | Edge Add-ons _(coming soon)_     |
| Firefox | Firefox Add-ons _(coming soon)_  |

### Manual Installation (Developer Mode)

1. **Clone the repository**

    ```bash
    git clone https://github.com/MohamedSayed0573/tubesize.git
    cd tubesize
    ```

2. **Install dependencies**

    ```bash
    npm install
    ```

3. **Build the extension**

    ```bash
    npm run build
    ```

4. **Load in Chrome / Edge**
    - Navigate to `chrome://extensions` (or `edge://extensions`)
    - Enable **Developer mode** (toggle in the top-right corner)
    - Click **Load unpacked** and select the project root folder

5. **Load in Firefox**
    - Navigate to `about:debugging#/runtime/this-firefox`
    - Click **Load Temporary Add-on**
    - Select the `manifest.json` file from the project root

---

## 🛠️ How It Works

The extension uses a three-layer data pipeline to retrieve video size information as efficiently as possible:

```
YouTube Page
     │
     ▼
[1] Content Script
    Extracts ytInitialPlayerResponse from the page DOM
     │
     ▼
[2] Background Service Worker
    ┌─────────────────────────────────────────────────┐
    │  Cache Hit? ──► Return cached data immediately  │
    │                                                 │
    │  Cache Miss?                                    │
    │    ├─► Parse HTML from content script           │
    │    │     (fastest, no extra network request)    │
    │    ├─► Fetch YouTube page directly (fallback)   │
    │    └─► Call backup API (last resort)            │
    └─────────────────────────────────────────────────┘
     │
     ▼
[3] Popup UI
    Displays sizes per resolution, respecting user options
```

### Data Source

YouTube embeds a `ytInitialPlayerResponse` JSON object in every video page. This object contains `streamingData.adaptiveFormats` — a list of all available video and audio streams with their `contentLength` (file size in bytes) and `itag` (format identifier).

The extension:

1. Filters for the relevant video itags: `394` (144p), `395` (240p), `396` (360p), `397` (480p), `398` (720p), `399` (1080p)
2. Extracts the audio stream (itag `251`) and adds its size to each video format to give you the **true download size**
3. Converts raw byte counts to human-readable sizes (e.g., `1.2 GB`, `450 MB`) using the [`filesize`](https://www.npmjs.com/package/filesize) library

### Caching

Fetched data is stored in `chrome.storage.local` with a **7-day TTL**. On subsequent visits to the same video, the popup loads instantly from cache with a "Cached X ago" note — no network request needed.

### Fallback API

If the local HTML parsing fails for any reason, the extension falls back to a private backup API hosted at `api.mohammedsayed.dev`. This ensures you always get results even in edge cases.

---

## ⚙️ Options

Click the **Options** button in the popup to open the settings page. You can toggle which resolutions are shown in the popup:

| Resolution | Default |
| ---------- | ------- |
| 144p       | ✅ On   |
| 240p       | ✅ On   |
| 360p       | ✅ On   |
| 480p       | ✅ On   |
| 720p       | ✅ On   |
| 1080p      | ✅ On   |

Preferences are saved to `chrome.storage.sync`, so they follow you across devices if you're signed into your browser.

---

## 🧰 Tech Stack

| Technology                        | Purpose                     |
| --------------------------------- | --------------------------- |
| **TypeScript**                    | Type-safe source code       |
| **esbuild**                       | Ultra-fast bundler/compiler |
| **Chrome Extensions Manifest V3** | Extension platform          |
| **Husky**                         | Git hooks for code quality  |
| **Prettier**                      | Code formatting             |

---

## 🔒 Permissions

The extension requests the minimum permissions necessary:

| Permission                        | Why it's needed                                         |
| --------------------------------- | ------------------------------------------------------- |
| `activeTab`                       | Read the URL of the current tab to extract the video ID |
| `storage`                         | Save cached video data and user preferences locally     |
| `host_permissions: *.youtube.com` | Inject the content script and fetch video page data     |

**No personal data is collected. No data is sent to any third party.**

---

## 🏗️ Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (rebuilds on file changes)
npm run watch

# Format code
npm run prettier:write

# Build and package into extension.zip
npm run pack
```

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome! Feel free to open an issue or submit a pull request.

1. Fork the repository
2. Create your feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m 'Add my feature'`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 👤 Author

**Mohammed Sayed**

- LinkedIn: [mohamed-sayed3](https://www.linkedin.com/in/mohamed-sayed3/)
- GitHub: [MohamedSayed0573](https://github.com/MohamedSayed0573)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

_Built with ❤️ to make every megabyte count._

</div>
