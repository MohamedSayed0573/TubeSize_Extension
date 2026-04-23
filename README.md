<div align="center">

<img src="tubesize/public/icons/icon-128.png" alt="TubeSize Logo" width="96" />

# TubeSize

![GitHub stars](https://img.shields.io/github/stars/MohamedSayed0573/Tubesize_Extension)

**Know exactly how much internet data a YouTube or Twitch stream will use before you press play.**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Install-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/tubesize/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Install-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/tubesize/mljmdmlkjajlklcaipidodlkfkcippka)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/mohamedsayed253)

</div>

---
TubeSize is a browser extension that shows estimated data usage for YouTube and Twitch directly in a popup without leaving the page.

## Installation

<table width="100%">
  <tr>
    <td valign="top" width="33%">
      <strong>Chrome Web Store</strong><br />
      Install the Chromium build for Chrome.<br /><br />
      <a href="https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi">
        <img src="https://img.shields.io/badge/Install%20for%20Chrome-4285F4?logo=google-chrome&logoColor=white" alt="Install for Chrome" />
      </a>
    </td>
    <td valign="top" width="33%">
      <strong>Firefox Add-ons</strong><br />
      Install the Firefox package from Mozilla Add-ons.<br /><br />
      <a href="https://addons.mozilla.org/en-US/firefox/addon/tubesize/">
        <img src="https://img.shields.io/badge/Install%20for%20Firefox-FF7139?logo=firefox&logoColor=white" alt="Install for Firefox" />
      </a>
    </td>
    <td valign="top" width="33%">
      <strong>Edge Add-ons</strong><br />
      Install the Chromium build for Microsoft Edge.<br /><br />
      <a href="https://microsoftedge.microsoft.com/addons/detail/tubesize/mljmdmlkjajlklcaipidodlkfkcippka">
        <img src="https://img.shields.io/badge/Install%20for%20Edge-0078D7?logo=microsoftedge&logoColor=white" alt="Install for Edge" />
      </a>
    </td>
  </tr>
</table>

---


## Screenshots

<div align="center">
  <img width="1280" height="800" alt="image" src="https://github.com/user-attachments/assets/63aab6a5-72f8-4065-b2a1-68d6b8c2b6b3" />
</div>
<br>

<div align="center">
  <img src="https://github.com/user-attachments/assets/1685c8eb-ff3f-49df-a3e8-0df363367aa1" alt="toast" width="48%" />
  <img alt="twitch1" src="https://github.com/user-attachments/assets/c56770f5-08ee-4a17-8ce1-3e05dcf13d5a" width="48%" />

</div>

---

## Features

- **YouTube Videos Support**: see estimated data usage for each video quality
- **Twitch Support**: compare data usage across stream qualities
- **Live Streams**: check usage estimates for YouTube Live and Twitch live
- **Data Usage Warning**: get alerted when a quality uses too much data
- **Quality Menu**: view size info directly inside YouTube’s quality menu
- **Shortcut**: open the popup anytime with Alt+P
- **Browsers**: use it on Chrome, Firefox, and Edge
---
## Permissions

The extension requests the minimum permissions required:

| Permission                          | Why                                                                       |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `activeTab`                         | Read the current tab's URL to detect the current YouTube or Twitch page   |
| `storage`                           | Cache YouTube data and user preferences locally                           |
| `host_permissions: *.youtube.com`   | Read YouTube pages and extract stream metadata locally                    |
| `host_permissions: *.twitch.tv`     | Read Twitch live/VOD pages and request Twitch playback metadata           |
| `host_permissions: usher.ttvnw.net` | Fetch Twitch HLS playlists to inspect available resolutions and bandwidth |
| `host_permissions: gql.twitch.tv`   | Request Twitch playback access tokens                                     |
---
## Stack

TubeSize is currently an extension-first project. The legacy API under `api/` is deprecated and not used by the extension.

| Layer        | Technology                                                                |
| ------------ | ------------------------------------------------------------------------- |
| Extension UI | React, TypeScript, Vite                                                   |
| Testing      | Jest                                                                      |
| Linting      | ESLint, Knip, Prettier                                                    |
| Storage      | `chrome.storage.local`, `chrome.storage.sync`                             |
| YouTube Data | `ytInitialPlayerResponse` parsing with direct YouTube HTML fetch fallback |
| Twitch Data  | Twitch GQL playback tokens + HLS playlist parsing                         |
| Packaging    | `vite-plugin-web-extension`, zip packaging                                |
| CI/CD        | GitHub Actions                                                            |

## How It Works

TubeSize uses two retrieval paths depending on the site.

```mermaid
flowchart LR
    A[Open YouTube or Twitch page] --> B{Site?}
    B -->|YouTube| C{Local cache?}
    C -->|Yes| D[Return cached sizes]
    C -->|No| E[Extract ytInitialPlayerResponse locally]
    E --> F{Local success?}
    F -->|Yes| G[Return sizes and cache non-live results]
    F -->|No| H[Fetch YouTube watch HTML]
    H --> I{Fetch parse success?}
    I -->|Yes| G
    I -->|No| X[Return extraction error]
    B -->|Twitch| J[Detect live channel or VOD]
    J --> K{Twitch VOD cache?}
    K -->|Yes| L[Return cached VOD estimates]
    K -->|No| M[Fetch Twitch playback token]
    M --> N[Fetch HLS master playlist]
    N --> O[Parse resolutions and bandwidth]
    O --> P[Return hourly and per-minute estimates and cache VOD results]
```
### Resolution & Codec Support

TubeSize resolves standard YouTube adaptive-streaming itags:

| Resolution | Itags checked (priority order) |
| ---------- | ------------------------------ |
| 144p       | 394, 330, 278, 160             |
| 240p       | 395, 331, 242, 133             |
| 360p       | 396, 332, 243, 134             |
| 480p       | 397, 333, 244, 135             |
| 720p       | 398, 334, 302, 247, 298, 136   |
| 1080p      | 399, 335, 303, 248, 299, 137   |
| 1440p      | 400, 336, 308, 271, 304, 264   |
| 2160p (4K) | 401, 337, 315, 313, 305, 266   |
| 4320p (8K) | 402, 571, 272, 138             |

For regular YouTube videos, audio size is determined by averaging all available `itag 251` (Opus 160kbps) streams returned by YouTube and is added to every video format.

For YouTube Live streams, TubeSize estimates both audio and video usage from bitrate data when content length is not available.

For Twitch live streams and VODs, TubeSize reads the HLS playlist variants exposed by Twitch and reports the available resolutions with approximate transfer usage derived from each variant bandwidth.

---
### Legacy API
The extension used to rely on an API that used yt-dlp to retrieve video data. The API is now deprecated and not used in the extension

---

## Author

**Mohammed Sayed**

- GitHub: [@MohamedSayed0573](https://github.com/MohamedSayed0573)
- LinkedIn: [mohamed-sayed3](https://www.linkedin.com/in/mohamed-sayed3/)
- Support: [ko-fi.com/mohamedsayed253](https://ko-fi.com/mohamedsayed253)

---

## License

[MIT](LICENSE)
