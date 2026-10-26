const PLATFORMS = ["youtube", "twitch", "kick"] as const;

const DEFAULT_CACHE_TTL = 3 * 24 * 60 * 60;

/** Live payloads go stale as soon as the broadcast changes, so cache them briefly. */
const LIVE_CACHE_TTL = 5 * 60;

const CONFIG = {
    FETCH_HTML_TIMEOUT: 5000,
    AUDIO_ITAG: 251,
    LIVE_AUDIO_ITAG: 140,
    DEFAULT_CACHE_TTL,
    LIVE_CACHE_TTL,
    DEFAULT_MAX_RETRIES: 3,
    VIDEO_ID_REGEX: /^[a-zA-Z0-9_-]{11}$/,
    YT_INITIAL_PLAYER_REGEX: /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
    CACHE_JUST_NOW_THRESHOLD: 5000,
    DEFAULT_TOASTER_THRESHOLD: 500,
    TOASTER_POLLING_INTERVAL: 5000,
    DEFAULT_TOASTER_ENABLED: true,
    DEFAULT_ADVANCED_VIEW: false,
    NUMBER_OF_SEGMENTS_TO_CHECK: 10,
    RANGES: ["today", "week", "month", "lifetime"],
    PLATFORMS,
    TWITCH_GQL_GRAPHQL_QUERY: `
        query PlaybackAccessToken_Template(
        $login: String!,
        $isLive: Boolean!,
        $vodID: ID!,
        $isVod: Boolean!,
        $playerType: String!,
        $platform: String!
        ) {
        streamPlaybackAccessToken(
            channelName: $login,
            params: {
            platform: $platform,
            playerBackend: "mediaplayer",
            playerType: $playerType
            }
        ) @include(if: $isLive) {
            value
            signature
            authorization {
            isForbidden
            forbiddenReasonCode
            }
            __typename
        }
        videoPlaybackAccessToken(
            id: $vodID,
            params: {
            platform: $platform,
            playerBackend: "mediaplayer",
            playerType: $playerType
            }
        ) @include(if: $isVod) {
            value
            signature
            __typename
        }
        video(id: $vodID) @include(if: $isVod) {
            lengthSeconds
        }
    }
`,
} as const;

export default CONFIG;
