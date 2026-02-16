const CONFIG = Object.freeze({
    VIDEO_FORMAT_IDS: ["394", "395", "396", "397", "398", "399"],
    AUDIO_FORMAT_ID: "251",
    YTDLP_TIMEOUT_MS: 20000,
    WINDOW_LIMIT_MS: 15 * 60 * 1000, // 15 minutes / Time frame for which requests are checked/remembered
    LIMIT: 20, // Number of requests allowed in the time frame
    YOUTUBE_ID_REGEX: /^[a-zA-Z0-9_-]{11}$/,
    CACHE_TTL: 3 * 60 * 60 * 1000, // 3 hour
    REDIS_HOST: "localhost",
    REDIS_PORT: 6379,
});

module.exports = CONFIG;
