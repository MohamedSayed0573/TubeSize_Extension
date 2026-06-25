# Privacy Policy for TubeSize

**Effective date:** 2026-06-25

## Overview

TubeSize is a browser extension that helps users estimate video and stream data usage across supported services, including YouTube, Twitch, and Kick.

TubeSize does not require an account or login, does not process payments, does not show ads, does not use analytics or telemetry SDKs, and does not send data to a developer-owned backend. TubeSize does not sell user data.

This Privacy Policy explains what data the extension handles, how that data is used, how it is stored, and what third-party requests may occur while the extension provides its core features.

## Data handled

TubeSize handles data only as needed to provide video size estimation, local caching, settings, and user-facing usage information.

The extension may handle the following data:

### Local media metadata cache

TubeSize stores cached media metadata in `chrome.storage.local` using cache keys for supported services, including YouTube, Twitch, and Kick.

Cached YouTube metadata may include:

- YouTube video ID
- Video title
- Duration
- Thumbnail URL
- Channel name
- Quality and size estimates

Cached Twitch VOD metadata may include:

- Twitch VOD ID
- Duration
- Stream variants
- Bitrate or size estimates

Cached Kick VOD metadata may include:

- Kick VOD ID
- Channel name, when available
- Duration
- Stream variants
- Bitrate or size estimates

### YouTube usage analytics stored locally

TubeSize stores local YouTube usage information under the `usageByDay` key in `chrome.storage.local`.

This information may include:

- Date buckets
- YouTube video ID
- Transfer-size usage totals
- Video title
- Thumbnail URL
- Channel name

TubeSize uses browser performance timing information on YouTube pages, including `PerformanceObserver` and `PerformanceResourceTiming.transferSize`, to estimate transfer-size usage. This data is accumulated locally while using supported YouTube pages.

### Extension settings

TubeSize stores user preferences in `chrome.storage.sync`, including settings such as:

- Data usage alert enabled or disabled
- Data usage alert threshold and threshold unit
- Cache retention duration
- Selected quality IDs
- Quality menu preference

These settings may sync across browsers or devices according to the user's browser profile and browser sync settings.

## How data is used

TubeSize uses handled data to provide its single purpose: showing video size and usage-related information for supported video platforms.

Data is used to:

- Estimate video or stream file sizes across available quality levels
- Cache metadata so repeated lookups are faster and more efficient
- Display local YouTube usage information to the user
- Update the extension badge with local daily YouTube usage
- Apply user preferences and extension settings
- Communicate between the popup, options page, content scripts, and supported active tabs

TubeSize does not use handled data for advertising, personalized ads, user profiling, creditworthiness, or selling data.

## Local/sync storage and retention

TubeSize uses Chrome extension storage APIs.

### Local storage

Media metadata cache and YouTube usage analytics are stored in `chrome.storage.local` on the user's device.

Cached media metadata expires based on the selected cache duration. The default cache duration is 3 days, and users may choose supported durations such as 1, 3, or 7 days.

Local cache and analytics data remain on the user's device unless:

- The data expires according to the selected cache duration
- The user clears it from TubeSize options
- The user removes the extension
- The user clears browser or extension storage

### Sync storage

TubeSize settings are stored in `chrome.storage.sync`.

Depending on the user's browser and sync configuration, these settings may be synced by the browser provider across signed-in browser profiles or devices. TubeSize does not control browser sync behavior.

## Third-party requests and parties

TubeSize makes HTTPS requests to supported video services only as needed to provide video size estimation and related functionality.

TubeSize may request data from the following third-party services:

### YouTube

TubeSize may request YouTube watch page and player metadata from YouTube pages to estimate video sizes and display related information.

### Twitch

TubeSize may request Twitch pages to obtain information needed for Twitch video analysis. It may also request Twitch GraphQL, Twitch HLS, Twitch usher, playlist, or CDN endpoints to inspect available stream variants and estimate sizes.

Examples of Twitch-related endpoints may include:

- `https://gql.twitch.tv/gql`
- `https://usher.ttvnw.net/...`
- Twitch playlist and CDN endpoints

### Kick

TubeSize may request Kick page HTML, Kick playback APIs, and Kick or IVS playback/CDN endpoints to inspect available stream variants and estimate sizes.

Examples of Kick-related endpoints may include:

- `https://web.kick.com/api/v1/stream/{streamId}/playback`
- Kick playback and CDN endpoints
- IVS playback and CDN endpoints

Some Kick requests use browser credentials. If the user is logged in to Kick, the browser may send Kick cookies or session information to Kick as part of those requests. TubeSize does not read, store, or manage Kick cookies itself.

### HLS and segment estimation

For HLS size estimation, TubeSize may fetch media playlists and may make byte-range sample requests, such as `Range: bytes=0-0`, to estimate actual segment sizes. TubeSize cancels response bodies when it only needs metadata or headers for estimation.

## Data sharing

TubeSize does not sell user data.

TubeSize does not send handled data to a developer-owned backend.

TubeSize does not share handled data with advertisers, analytics providers, telemetry services, or data brokers.

Data may be sent to YouTube, Twitch, Kick, or their related playback/CDN services when the extension makes HTTPS requests needed to provide its video size estimation features. Those services process requests according to their own privacy policies and account/session behavior.

TubeSize may disclose information if required by law or to protect the security, integrity, or safety of the extension or its users.

## Security

TubeSize uses HTTPS for reviewed network requests to supported video platforms and related playback/CDN endpoints.

TubeSize stores extension data using Chrome extension storage APIs. Local cache and analytics data are stored on the user's device. Sync settings are handled by the browser's sync system when enabled.

No method of storage or transmission is completely secure, but TubeSize is designed to limit data handling to what is needed for its user-facing functionality.

## User controls and deletion

Users can clear TubeSize local cache and local analytics data from:

**Options > Cache > Clear Cache**

Users can also delete TubeSize data by removing the extension or clearing browser extension storage.

Settings stored in `chrome.storage.sync` may be managed through the browser's extension storage and sync controls. If browser sync is enabled, synced settings may be retained or restored according to the browser provider's sync behavior.

## Children

TubeSize is not directed to children. TubeSize does not knowingly collect personal information from children.

## Changes

This Privacy Policy may be updated from time to time to reflect changes to TubeSize features, data handling, browser platform requirements, or Chrome Web Store policy requirements.

When the policy changes, the updated version will include a new effective date.

## Contact

For questions about this Privacy Policy or TubeSize data handling, contact:

**Mohamed Sayed**  
**Email:** mohamedsaid0573@gmail.com

Chrome Web Store listing:  
https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi

## Chrome Web Store Limited Use disclosure

TubeSize's use of handled user data is limited to providing and improving the extension's single purpose: helping users view estimated file size and usage information for supported videos and streams.

TubeSize does not use handled data for personalized advertising, does not sell handled data, and does not transfer handled data except as necessary to provide or improve the extension's user-facing features, comply with applicable law, protect security, or as part of a merger, acquisition, or sale of assets.

TubeSize does not allow humans to read handled user data except where necessary for security, legal compliance, support requested by the user, or abuse prevention.

## Permissions

TubeSize requests permissions needed for its features.

### `activeTab`

Used to identify and communicate with the currently active supported tab, such as a YouTube, Twitch, or Kick page, when the user interacts with the extension.

### `storage`

Used to store local cache, local YouTube usage analytics, and user settings.

### Host permissions and content scripts

TubeSize runs content scripts or makes requests for supported video platforms and related playback services, including YouTube, Twitch, Twitch GraphQL, Twitch usher, Twitch playlist/CDN endpoints, Kick, Kick playback APIs, and Kick/IVS playback/CDN endpoints.

These permissions allow TubeSize to read supported page context and request video metadata or playback information needed to estimate video and stream sizes.
