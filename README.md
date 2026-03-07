<div align="center">

<h1>
  <img src="extension/icons/icon-128.png" alt="TubeSize Logo"/>
    <br>
  TubeSize - YouTube Video Size Viewer
</h1>

**Know exactly how much data a YouTube video will cost you — before you press play.**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Web%20Store-4285F4?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Add--ons-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Add--ons-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/intro/)

</div>

---

## 📸 Screenshots

<div align="center">
    <img alt="image" src="https://github.com/user-attachments/assets/1289364f-3cce-4050-a301-cb91e60a36bc" />&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;

</div>

---

## 🚀 Installation

### Download from Releases

1. Go to the [Releases page](https://github.com/MohamedSayed0573/tubesize/releases).
2. Download the latest browser package:
    - `TubeSize_Extension.zip` for Chrome / Edge
    - `TubeSize_Firefox_Extension.zip` for Firefox
3. Extract the zip file.
4. Open `chrome://extensions`
5. Enable **Developer mode**.
6. Click **Load unpacked** and select the extracted folder.

### Manual Installation (Developer Mode)

1. **Clone the repository**

    ```bash
    git clone https://github.com/MohamedSayed0573/tubesize.git
    cd tubesize
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Build the extension**

    ```bash
    cd extension && pnpm run build
    ```

4. **Load in Chrome / Edge**
    - Navigate to `chrome://extensions`
    - Enable **Developer mode** (toggle in the top-right corner)
    - Click **Load unpacked** and select the `extension` folder

### Package for Each Browser

- Chrome / Edge: `cd extension && pnpm run pack`
- Firefox: `cd extension && pnpm run pack:firefox`

The Firefox package is built from `extension/manifest.firefox.json` and renamed to `manifest.json` inside the final zip, which is what Firefox expects.

---

## 🛠️ How It Works

TubeSize resolves video sizes locally whenever possible, then formats the result into a simple per-resolution list in the popup.

### 1. Detect the current video

- The content script listens for YouTube's in-page navigation and grabs the script that contains `ytInitialPlayerResponse`.
- The popup validates the active tab, makes sure it's a normal YouTube watch page, and skips Shorts.

### 2. Resolve the raw stream data

- The background service worker checks `chrome.storage.local` first and returns cached data immediately when it exists.
- On a cache miss, it tries to parse the `ytInitialPlayerResponse` sent from the content script.
- If that data is missing, it fetches the YouTube watch page directly and extracts the same player response from the HTML.
- If local extraction fails and API fallback option is enabled, it requests the data from the backup API at `https://api.mohammedsayed.dev`.

### 3. Turn streams into displayed sizes

- The extension scans YouTube's adaptive formats and matches them against a priority list of itags for each resolution.
- It estimates the audio portion using the available `itag 251` streams, averages them, and adds that audio size to each video format.
- For lower resolutions, it shows the preferred format's size.
- Starting at `1080p`, if multiple valid formats exist, it can show a size range from the smallest to the largest matching stream.
- Finally, raw byte counts are converted into human-readable values like `850 MB` or `1.2 GB`.

### 4. Cache and display the result

- Locally extracted results are cached in `chrome.storage.local` with a configurable TTL (`3 days` by default).
- Incomplete results such as `0 B` entries are not cached.
- Cached responses show a `Cached X ago` note in the popup.
- API fallback responses are returned to the popup, but they are not cached locally so the cache stays consistent.

---

## 🔒 Permissions

The extension requests the minimum permissions necessary:

| Permission                                | Why it's needed                                          |
| ----------------------------------------- | -------------------------------------------------------- |
| `activeTab`                               | Read the URL of the current tab to extract the video ID  |
| `storage`                                 | Save cached video data and user preferences locally      |
| `host_permissions: *.youtube.com`         | Inject the content script and fetch video page data      |
| `host_permissions: api.mohammedsayed.dev` | Call the optional backup API when local extraction fails |

---

## 👤 Author

**Mohammed Sayed**

- LinkedIn: [mohamed-sayed3](https://www.linkedin.com/in/mohamed-sayed3/)
- GitHub: [MohamedSayed0573](https://github.com/MohamedSayed0573)

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
