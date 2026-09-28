# Privacy Policy for TubeSize

**Effective date:** 2026-09-28

TubeSize tracks data usage across all websites and estimates YouTube, Twitch, and Kick video sizes. Your usage data stays in your browser. Nothing is sent to the developer.

## What is stored

- **Per-site totals:** date + origin (for example `https://example.com`) + bytes. No full URLs, paths, titles, or content.
- **Per-video totals:** date + `platform:videoId` (YouTube ID, Twitch VOD ID or channel, Kick VOD ID or channel) + bytes.
- **Video display data:** title, channel name/URL, thumbnail, platform. Twitch/Kick entries also keep the visited page URL; YouTube entries do not.
- **Size-estimate cache:** video IDs, durations, quality/bitrate estimates. Stops being used after 3 days and is deleted on next read; entries never read again remain until storage is cleared.
- **Settings:** alert on/off, alert threshold, quality filters, language.

## Where it is stored

- Usage, per-video totals, and video display data: IndexedDB on your device. No automatic expiry.
- Size-estimate cache: `chrome.storage.local` on your device.
- Settings: `chrome.storage.sync` (may sync via your browser profile).

## What is transmitted

Nothing goes to the developer, advertisers, or analytics services. To estimate sizes, the extension fetches public metadata directly from YouTube, Twitch (including GraphQL, usher, playlist/CDN), Kick (including playback/IVS/CDN), and HLS playlists, including small byte-range samples. If you are logged in to those sites, your browser may send their cookies with those requests per their own policies.

## Sharing

TubeSize does not sell data and does not share it except as needed for its features, for legal/security reasons, or in a merger or asset sale. TubeSize's use of data complies with the Chrome Web Store Limited Use requirements: no personalized advertising, no sale, no human reads except for security, legal, user-requested support, or abuse prevention.

## Deletion

- **Dashboard > Clear All Usage Data** deletes usage, per-video totals, and video display data.
- **Dashboard > Import JSON** replaces per-site totals only; **Export To JSON** saves per-site totals only (no per-video totals or video display data).
- Cache entries stop being used after 3 days and are removed on next read. Removing the extension or clearing browser extension storage deletes remaining local data. Synced settings follow your browser sync controls.

## Security

HTTPS for platform requests; data kept in IndexedDB and extension storage on your device. No storage method is fully secure, but handling is limited to what the features need.

## Permissions

`storage` (cache + settings), `webRequest` (read `Content-Length` on `<all_urls>` to count bytes), `favicon` (local site icons), `activeTab` (current supported tab), `<all_urls>` host/content scripts (count all-sites usage; size overlays only on YouTube/Twitch/Kick).

## Changes and contact

Updates get a new effective date. Contact: Mohamed Sayed, mohamedsaid0573@gmail.com. Listing: https://chromewebstore.google.com/detail/tubesize/bdpkcpbkonollfbgcnkknkjdbfpacnoi
