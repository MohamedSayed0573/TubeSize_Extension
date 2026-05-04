export type RawData = {
    videoDetails: {
        videoId: string;
        title: string;
        lengthSeconds: string;
        isLive: boolean;
        author: string;
    };
    streamingData: {
        adaptiveFormats: {
            itag: number;
            height: number;
            contentLength?: string;
            bitrate?: number;
            mimeType?: string;
        }[];
    };
};

export type RawFormat = {
    id: string;
    title: string;
    durationSeconds: number;
    isLive: boolean;
    formats: {
        formatId: number;
        height: number;
        sizeBytes: number;
        maxSizeBytes?: number;
        bitrateBitsPerSecond?: number;
    }[];
    audioFormats: {
        formatId: number;
        sizeBytes: number;
    }[];
};

type SuccessResponse<T> = {
    success: true;
    data: T;
    cached?: boolean;
    createdAt?: string;
};
type ErrorResponse = {
    success: false;
    message: string;
};

export type YoutubeVideoFormat = {
    formatId: number;
    height: number;
    sizeMB: string;
    sizePerMinuteMB: number;
    maxSizeMB?: string;
};

export type YoutubeVideoData = {
    type: "video";
    formats: YoutubeVideoFormat[];
    title: string;
    durationSeconds: number;
    id: string;
    isShorts?: boolean;
};

type YoutubeLiveData = {
    type: "live";
    formats: StreamInfo[];
    channelName: string;
};

export type YoutubeData = YoutubeVideoData | YoutubeLiveData;
export type YoutubeBackgroundResponse = SuccessResponse<YoutubeData> | ErrorResponse;

export type HumanizedFormat = {
    id: string;
    title: string;
    isLive: boolean;
    durationSeconds: number;
    videoFormats: YoutubeVideoFormat[];
};

export type StorageData<T extends YoutubeVideoData | TwitchData | KickData> = {
    data: T;
    expiry?: number;
    createdAt?: string;
};

export type OptionsMap = {
    toasterEnabled?: boolean;
    toasterThreshold?: number;
    toasterThresholdUnit?: string;
    cacheTTL?: number;
    qualityIds?: Record<string, boolean>;
    qualityMenu?: boolean;
};

export type StreamInfo = {
    sizePerSecondBytes: number;
    resolution: number;
};

export type TwitchLiveData = { type: "live"; data: StreamInfo[]; channelName: string };
export type TwitchVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    durationSeconds: number | undefined;
};

export type TwitchData = TwitchLiveData | TwitchVodData;
export type TwitchBackgroundResponse = SuccessResponse<TwitchData> | ErrorResponse;

export type TwitchGqlResponse = {
    data: {
        streamPlaybackAccessToken?: {
            value: string;
            signature: string;
        };
        videoPlaybackAccessToken?: {
            value: string;
            signature: string;
        };
        video?: {
            lengthSeconds: number;
        };
    };
};

export type TwitchTokenData = {
    value: string;
    signature: string;
    durationSeconds?: number;
};

export type FrontEndMessage =
    | YoutubeMessage
    | TwitchVodMessage
    | TwitchLiveMessage
    | KickLiveMessage
    | KickVodMessage
    | { type: "clearBadge" }
    | { type: "setBadge" };

export type YoutubeMessage = {
    type: "youtubeVideo";
    videoTag: string;
    tabId?: number;
    html?: string;
};
export type TwitchMessage = TwitchVodMessage | TwitchLiveMessage;

export type TwitchVodMessage = {
    type: "twitchVod";
    vodId: string;
};

export type TwitchLiveMessage = {
    type: "twitchLive";
    channelName: string;
    fromPopup: boolean;
};

export type KickLiveMessage = {
    type: "kickLive";
    streamId: string;
    fromPopup: boolean;
};

export type KickVodMessage = {
    type: "kickVod";
    vodId: string;
    streamId: string;
};
export type KickMessage = KickLiveMessage | KickVodMessage;

type KickLiveData = {
    type: "live";
    data: StreamInfo[];
    channelName: string;
};

type KickVodData = {
    type: "vod";
    data: StreamInfo[];
    vodId: string;
    channelName: string | undefined;
    durationSeconds: number | undefined;
};

export type KickData = KickLiveData | KickVodData;
export type KickBackgroundResponse = SuccessResponse<KickData> | ErrorResponse;
