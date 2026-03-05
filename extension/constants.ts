const VIDEO_ITAGS = new Map([
    [144, [394, 330, 278, 160]],
    [240, [395, 331, 242, 133]],
    [360, [396, 332, 243, 134]],
    [480, [397, 333, 244, 135]],
    [720, [398, 334, 302, 247, 298, 136]],
    [1080, [399, 335, 303, 248, 299, 137]],
    [1440, [400, 336, 308, 271, 304, 264]],
    [2160, [401, 337, 315, 313, 305, 266]],
    [4320, [402, 571, 272, 138]],
]);

const ttlInSecondsOptions: Map<string, number> = new Map([
    ["1", 1 * 24 * 60 * 60],
    ["3", 3 * 24 * 60 * 60],
    ["7", 7 * 24 * 60 * 60],
]);

const optionIDs = ["p144", "p240", "p360", "p480", "p720", "p1080", "p1440", "p2160", "p4320"];

const CONFIG = {
    FETCH_HTML_TIMEOUT: 5000,
    FETCH_API_TIMEOUT: 15000,
    VIDEO_ITAGS,
    resolutions: Array.from(VIDEO_ITAGS.entries()),
    AUDIO_ITAG: 251,
    DEFAULT_CACHE_TTL: 3 * 24 * 60 * 60, // 3 Days
    ttlInSecondsOptions,
    optionIDs,
    DEFAULT_MAX_REPLIES: 3,
    VIDEO_ID_REGEX: /^[a-zA-Z0-9_-]{11}$/,
    YT_INITIAL_PLAYER_REGEX: /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
    CACHE_JUST_NOW_THRESHOLD: 5000,
} as const;

export default CONFIG;
