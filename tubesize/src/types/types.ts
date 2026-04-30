export type RawData = {
    videoDetails: {
        videoId: string;
        title: string;
        lengthSeconds: string;
        isLive: boolean;
    };
    streamingData: {
        adaptiveFormats: {
            itag: number;
            height: number;
            contentLength?: string;
            bitrate?: number;
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

export type HumanizedFormat = {
    id: string;
    title: string;
    isLive: boolean;
    durationMinutes: string;
    videoFormats: {
        formatId: number;
        height: number;
        sizeMB: string;
        sizePerMinuteMB: number;
        maxSizeMB?: string;
    }[];
};

export type StorageData<T extends HumanizedFormat | TwitchData> = {
    response: T;
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

export type YoutubeBackgroundResponse = {
    success: boolean;
    data?: HumanizedFormat | null;
    cached?: boolean;
    isShorts?: boolean;
    createdAt?: string; // Only when we use cached
    message?: string;
};

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

export type StreamInfo = {
    sizePerSecondBytes: number;
    resolution: number;
};

export type TwitchData =
    | { type: "live"; data: StreamInfo[]; channelName: string }
    | { type: "vod"; data: StreamInfo[]; vodId: string; durationSeconds: number | undefined };

export type TwitchBackgroundResponse = {
    success: boolean;
    twitchData?: TwitchData;
    message?: string;
    cached?: boolean;
    createdAt?: string;
};

export type KickBackgroundResponse = {
    success: boolean;
    kickData?: StreamInfo[];
    message?: string;
    channelName?: string;
};

export type FrontEndMessage =
    | YoutubeMessage
    | TwitchVodMessage
    | TwitchLiveMessage
    | KickLiveMessage
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
};

export type KickLiveMessage = {
    type: "kickLive";
    streamId: string;
};
