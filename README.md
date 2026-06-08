<div align="center">

<img src="public/icons/icon-128.png" alt="TubeSize Logo" width="96" />

# TubeSize

![Number of Users](https://img.shields.io/chrome-web-store/users/bdpkcpbkonollfbgcnkknkjdbfpacnoi?label=Number%20of%20Users&link=https%3A%2F%2Fchromewebstore.google.com%2Fdetail%2Ftubesize%2Fbdpkcpbkonollfbgcnkknkjdbfpacnoi)

**Know exactly how much internet data a YouTube, Twitch, or Kick stream will use before you press play.**

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Install-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/tubesize/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Install-0078D7?logo=microsoftedge&logoColor=white)](https://chromewebstore.google.com/detail/tubesize/mljmdmlkjajlklcaipidodlkfkcippka)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)](https://react.dev/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/mohamedsayed253)

</div>

---

TubeSize is a lightweight, premium browser extension that estimates data usage and file sizes for YouTube, Twitch, and Kick streams in real-time. It features an interactive daily usage analytics dashboard, custom threshold data alerts, and direct integration into video players.

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
      <a href="https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi">
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
  <img width="1280" height="800" alt="analytics" src="https://github.com/user-attachments/assets/96d61287-64ad-41e5-8eb1-9e5e32cb839d" />
  <img alt="twitch1" src="https://github.com/user-attachments/assets/c56770f5-08ee-4a17-8ce1-3e05dcf13d5a" width="48%" />
</div>

---

## Features

- **YouTube Quality Estimates**: View calculated file sizes for standard resolutions on video pages, Shorts, and Live streams.
- **Twitch Stream Diagnostics**: Compare data consumption across resolutions for live streams and VODs.
- **Kick Platform Support (New)**: Compare data usage estimates for Kick live streams and VODs using HLS stream bandwidth profiles.
- **Data Usage Analytics Dashboard (New)**: Track your daily YouTube data usage dynamically. View usage metrics across:
    - Today, Last 7 Days, Last 30 Days, and Lifetime totals.
    - Interactive daily bandwidth consumption graphs built with Recharts.
    - Granular breakdown of videos watched, complete with thumbnails, channel names, and exact data consumed.
- **Dynamic Badge Counter (New)**: View your real-time cumulative daily YouTube bandwidth consumption directly on the extension icon's badge (e.g., `1.2G` or `450M`).
- **Bandwidth Warning Toasts**: Set data thresholds in Settings and receive automated notifications if a stream's bitrate exceeds your limits.
- **Quality Menu Integration**: Embed calculated file size details directly inside YouTube's native player settings and quality selection dropdowns.
- **Keyboard Shortcut**: Open the TubeSize extension popup at any time using `Alt+P` (or custom hotkey).
- **Modern Options Panel**: Customize cache time-to-live (TTL), adjust notification triggers, clear analytics/caches, and filter custom streaming qualities.

---

## Permissions

The extension requests the minimum permissions required to perform client-side analysis and local usage tracking:

| Permission                                          | Why                                                                   |
| :-------------------------------------------------- | :-------------------------------------------------------------------- |
| `activeTab`                                         | Read the current tab's URL to detect YouTube, Twitch, or Kick pages.  |
| `storage`                                           | Cache stream metadata, user preferences, and usage analytics locally. |
| `host_permissions: *.youtube.com`                   | Read YouTube pages and parse player initial configurations locally.   |
| `host_permissions: *.twitch.tv`                     | Query Twitch GQL APIs to retrieve stream token hashes.                |
| `host_permissions: gql.twitch.tv`                   | Request authorization payloads for Twitch stream playbacks.           |
| `host_permissions: usher.ttvnw.net`                 | Retrieve HLS master playlists to map resolutions and bitrates.        |
| `host_permissions: *.playlist.ttvnw.net`            | Read dynamic stream playlist streams.                                 |
| `host_permissions: *.cloudfront.hls.ttvnw.net`      | Connect to Twitch media CDNs for packet analysis.                     |
| `host_permissions: *.kick.com`                      | Fetch Kick channel, live stream HTML, and VOD session records.        |
| `host_permissions: *.playback.live-video.net`       | Retrieve Kick live master M3U8 streams via the IVS Player API.        |
| `host_permissions: *.cloudfront.hls.live-video.net` | Analyze Kick video chunks on Amazon Interactive Video Service.        |

---

## Technology Stack

TubeSize is an modern, extension-first project. The legacy API under `api/` is fully deprecated and is no longer used by the extension.

| Layer                 | Technology                                                                                         |
| :-------------------- | :------------------------------------------------------------------------------------------------- |
| **Frontend & UI**     | React 19, TypeScript, Vite, React Router v7, Recharts, CSS Variables                               |
| **Testing**           | Jest, ts-jest, jest-extended                                                                       |
| **Linting & Tooling** | ESLint 10, Knip, Prettier, Husky, Lint-Staged                                                      |
| **Local Cache**       | `chrome.storage.local` (media cache, daily analytics) and `chrome.storage.sync` (user preferences) |
| **Data Parsing**      | Zod (schema verification) & `m3u8-parser` (Twitch/Kick streams)                                    |
| **Packaging**         | `@crxjs/vite-plugin` (Manifest V3 integration), zip packaging                                      |
| **CI/CD**             | GitHub Actions                                                                                     |

---

## How It Works

### Size Retrieval Flow

TubeSize performs completely client-side extraction to estimate resolution-specific streaming filesizes:

```mermaid
flowchart TD
    A[Open TubeSize Popup] --> B{What Platform?}

    B -->|YouTube| YT_Cache{In local cache?}
    YT_Cache -->|Yes| YT_Show[Show cached video quality sizes]
    YT_Cache -->|No| YT_Extract[Extract ytInitialPlayerResponse from page]
    YT_Extract --> YT_Success{Extraction successful?}
    YT_Success -->|Yes| YT_CacheAndShow[Show sizes & cache details]
    YT_Success -->|No| YT_Fetch[Fetch YouTube watch HTML manually]
    YT_Fetch --> YT_FetchSuccess{Parse successful?}
    YT_FetchSuccess -->|Yes| YT_CacheAndShow
    YT_FetchSuccess -->|No| YT_Error[Display extraction error]

    B -->|Twitch| TW_Detect{Live or VOD?}
    TW_Detect -->|VOD| TW_VODCache{In local cache?}
    TW_VODCache -->|Yes| TW_ShowVOD[Show cached VOD quality estimates]
    TW_VODCache -->|No| TW_GQL[Fetch Twitch playback access token]
    TW_Detect -->|Live| TW_GQL
    TW_GQL --> TW_M3U8[Request HLS master playlist m3u8]
    TW_M3U8 --> TW_Parse[Parse stream resolutions and bandwidths]
    TW_Parse --> TW_Show[Display estimates & cache VOD results]

    B -->|Kick| KK_Detect{Live or VOD?}
    KK_Detect -->|VOD| KK_VODCache{In local cache?}
    KK_VODCache -->|Yes| KK_ShowVOD[Show cached VOD quality estimates]
    KK_VODCache -->|No| KK_HTML[Retrieve Kick HTML / Stream ID]
    KK_Detect -->|Live| KK_HTML
    KK_HTML --> KK_IVS[Request IVS playback credentials & M3U8]
    KK_IVS --> KK_Parse[Parse resolutions and bandwidths]
    KK_Parse --> KK_Show[Display estimates & cache VOD results]
```

### Real-Time YouTube Analytics & Badge Flow

Bandwidth usage tracking runs fully locally in your browser to maintain strict privacy:

```mermaid
flowchart LR
    A[User watches YouTube video] --> B[PerformanceObserver records resource timing logs]
    B --> C[Accumulate transferSize of video network packets]
    C --> D[Log incremental usage in chrome.storage.local every 5s]
    D --> E[Read today's total data usage]
    E --> F[Update extension badge label e.g., 1.2G]
```

---

### Resolution & Codec Support

#### YouTube

TubeSize resolves standard YouTube adaptive-streaming itags:

| Resolution | Itags checked (priority order) |
| :--------- | :----------------------------- |
| 144p       | 394, 330, 278, 160             |
| 240p       | 395, 331, 242, 133             |
| 360p       | 396, 332, 243, 134             |
| 480p       | 397, 333, 244, 135             |
| 720p       | 398, 334, 302, 247, 298, 136   |
| 1080p      | 399, 335, 303, 248, 299, 137   |
| 1440p      | 400, 336, 308, 271, 304, 264   |
| 2160p (4K) | 401, 337, 315, 313, 305, 266   |
| 4320p (8K) | 402, 571, 272, 138             |

For regular YouTube videos, audio size is determined by averaging all available `itag 251` (Opus 160kbps) streams returned by YouTube and is added to every video format. For YouTube Live streams, TubeSize estimates both audio and video usage from bitrate data when content length is not available.

#### Twitch & Kick

For Twitch and Kick live streams and VODs, TubeSize reads the HLS playlist variants exposed by the streaming APIs and reports the available resolutions with approximate transfer usage derived from each variant's bandwidth (e.g., resolving resolutions like 1080p60, 720p60, 720p, 480p, 360p, 160p).

---

## Author

**Mohammed Sayed**

- GitHub: [@MohamedSayed0573](https://github.com/MohamedSayed0573)
- LinkedIn: [mohamed-sayed3](https://www.linkedin.com/in/mohamed-sayed3/)
- Support: [ko-fi.com/mohamedsayed253](https://ko-fi.com/mohamedsayed253)

---

## License

[MIT](LICENSE)
