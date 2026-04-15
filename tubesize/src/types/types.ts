export type APIData = {
    success: boolean;
    id: string;
    title: string;
    durationMinutes: string;
    audioFormat: string;
    videoFormats: {
        formatId: number;
        height: number;
        sizeMB: string;
        sizePerMinuteMB: number;
    }[];
    isLive: boolean;
    createdAt?: string;
    executionTime: string;
};

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

export type StorageData = {
    response: APIData | HumanizedFormat;
    expiry?: number;
    createdAt?: string;
};

export type YoutubeBackgroundResponse = {
    success: boolean;
    data?: APIData | HumanizedFormat | null;
    cached?: boolean;
    isShorts?: boolean;
    createdAt?: string; // Only when we use cached
    message?: string;
    api?: boolean; // Only when we use the server API
    executionTime?: string; // Only when we use the server API
};

export type TwitchTokenData = {
    data: {
        streamPlaybackAccessToken: {
            value: string;
            signature: string;
        };
    };
};

export type TwitchData = {
    data: {
        bandwidth: number;
        resolution: number;
        codec: string;
    }[];
    channelName: string;
};

export type TwitchBackgroundResponse = {
    success: boolean;
    twitchData?: TwitchData;
    message?: string;
};
