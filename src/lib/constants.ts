const PLATFORMS = ["youtube", "twitch", "kick"] as const;

const DEFAULT_CACHE_TTL = 3 * 24 * 60 * 60;

const LIVE_CACHE_TTL = 5 * 60;

const CONFIG = {
    FETCH_HTML_TIMEOUT: 5000,
    DEFAULT_CACHE_TTL,
    LIVE_CACHE_TTL,
    DEFAULT_MAX_RETRIES: 3,
    DEFAULT_TOASTER_THRESHOLD: 500,
    DEFAULT_TOASTER_ENABLED: true,
    DEFAULT_ADVANCED_VIEW: false,
    DEFAULT_INCLUDE_AUDIO: true,
    NUMBER_OF_SEGMENTS_TO_CHECK: 10,
    MIN_CHARTED_SITE_BYTES: 1_000_000,
    RANGES: ["today", "week", "month", "lifetime"],
    PLATFORMS,
} as const;

export default CONFIG;
