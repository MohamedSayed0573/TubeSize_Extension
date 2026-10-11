<div align="center">

<img src="public/icons/icon-128.png" alt="TubeSize Logo" width="96" />

# TubeSize

![Number of Users](https://img.shields.io/chrome-web-store/users/bdpkcpbkonollfbgcnkknkjdbfpacnoi?label=Number%20of%20Users&link=https%3A%2F%2Fchromewebstore.google.com%2Fdetail%2Ftubesize%2Fbdpkcpbkonollfbgcnkknkjdbfpacnoi)

**Know where your internet data goes, before and after.**

Track how much data every website uses, and see the estimated data cost of a YouTube, Twitch, or Kick video before you press play. Built for people with a monthly data cap.

[![Chrome Web Store](https://img.shields.io/badge/Chrome-Install-4285F4?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox-Install-FF7139?logo=firefox&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/tubesize/)
[![Edge Add-ons](https://img.shields.io/badge/Edge-Install-0078D7?logo=microsoftedge&logoColor=white)](https://microsoftedge.microsoft.com/addons/detail/tubesize/mljmdmlkjajlklcaipidodlkfkcippka)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react&logoColor=white)](https://react.dev/)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)](https://developer.chrome.com/docs/extensions/mv3/)

[![Support me on Ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/mohamedsayed253)

</div>

---

## Two tools in one

### See where your internet data went

Track usage across **all websites** and find out which ones eat your quota.

### See what a video will cost before you watch

Get estimated data usage for every quality on YouTube, Twitch, and Kick.

---

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
  <img width="3840" height="2400" alt="full" src="https://github.com/user-attachments/assets/49c4fecd-5eca-479c-8cae-d36aea54c37e" />

</div>
<br>

<div align="center">
  <img width="1280" height="800" alt="screenshot_1280x800" src="https://github.com/user-attachments/assets/066ace95-5775-424a-86f9-4bdcbb6df485" />
  <img width="1366" height="768" alt="Screenshot 2026-10-02 192713" src="https://github.com/user-attachments/assets/9d3579b1-8bbb-4010-a720-0fbc941852c1" />

</div>

---

## Features

### Usage tracking

- **All-Sites Data Tracking**: See how much data every website you visit consumes, so you know what is using up your monthly quota.
- **Usage Dashboard**: Track your daily data usage across:
    - Today, Last 7 Days, Last 30 Days, and Lifetime totals.
    - Interactive daily bandwidth consumption graphs built with Recharts.
    - Per-site breakdown of data consumed.
    - For YouTube, a granular breakdown of videos watched with thumbnails, channel names, and measured data consumed.
- **Dynamic Badge Counter**: View your real-time cumulative daily data usage directly on the extension icon's badge (e.g., `1.2G` or `450M`).

### Video size estimates

- **YouTube Quality Estimates**: View calculated file sizes for standard resolutions on video pages, Shorts, and Live streams.
- **Twitch Stream Diagnostics**: Compare data consumption across resolutions for live streams and VODs.
- **Kick Platform Support**: Compare data usage estimates for Kick live streams and VODs using HLS stream bandwidth profiles.
- **Quality Menu Integration**: Embed calculated file size details directly inside YouTube's native player settings and quality selection dropdowns.
- **Bandwidth Warning Toasts**: Set data thresholds in Settings and receive automated notifications if a stream's bitrate exceeds your limits.

---

## Permissions

The manifest (`wxt.config.ts`, Manifest V3) declares exactly:

- `permissions: ["activeTab", "storage", "webRequest"]` plus `"favicon"` on Chromium only
- `host_permissions: ["<all_urls>"]`

| Permission                     | Why                                                                                                                                                                                                                                                                                                                                                            |
| :----------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activeTab`                    | Temporary access to the active tab when you open the popup (`Alt+P`) to detect YouTube/Twitch/Kick URLs, query the current resolution, and open dashboard/popup routes. No persistent `tabs` permission is requested.                                                                                                                                          |
| `storage`                      | `chrome.storage.local` holds the stream metadata cache (`youtube:`/`twitch:`/`kick:` keys with TTL); `chrome.storage.sync` holds user settings (alert threshold, quality filters, language).                                                                                                                                                                   |
| `webRequest`                   | Background `chrome.webRequest.onCompleted` listener on `<all_urls>` reads `Content-Length` response headers and attributes bytes per request initiator. Responses without `Content-Length` (chunked/live streams) are counted instead by the page-world `fetch`/Worker patch.                                                                                  |
| `favicon` (Chromium only)      | Resolves per-site icons in the popup/dashboard via `chrome.runtime.getURL("/_favicon/")`. Firefox has no `/_favicon/` endpoint, so the popup requests the open site's `<origin>/favicon.ico` directly (typically browser-cached), then a placeholder, and the dashboard shows a placeholder without any website requests. No third-party icon service is used. |
| `host_permissions: <all_urls>` | Enables all-sites usage tracking and size-estimate fetches (YouTube/Twitch/Kick pages, stream APIs, and HLS CDNs). Video overlay only runs on YouTube, Twitch, and Kick pages.                                                                                                                                                                                 |

See [PRIVACY.md](PRIVACY.md) for details on what is stored and why.

---

## Technology Stack

| Layer              | Technology                                                                                |
| :----------------- | :---------------------------------------------------------------------------------------- |
| **Frontend & UI**  | React, TypeScript, WXT, React Router, TanStack Query, Recharts, Tailwind CSS, chrome.i18n |
| **Storage**        | Dexie (IndexedDB), `chrome.storage.local` / `sync`                                        |
| **Data parsing**   | Zod, `m3u8-parser`, cheerio, tldts                                                        |
| **Testing**        | Jest, ts-jest, jest-extended                                                              |
| **Tooling**        | ESLint, Knip, Prettier, Husky, lint-staged                                                |
| **Packaging / CI** | WXT Manifest V3 builds, GitHub Actions                                                    |

---

## Author

**Mohammed Sayed**

- GitHub: [@MohamedSayed0573](https://github.com/MohamedSayed0573)
- LinkedIn: [mohamed-sayed3](https://www.linkedin.com/in/mohamed-sayed3/)
- Support: [ko-fi.com/mohamedsayed253](https://ko-fi.com/mohamedsayed253)

---

## License

[MIT](LICENSE)
