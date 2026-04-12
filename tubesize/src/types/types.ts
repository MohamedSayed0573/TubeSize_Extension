export type APIData = {
    success: boolean;
    id: string;
    title: string;
    duration: string;
    audioFormat: string;
    videoFormats: {
        formatId: number;
        height: number;
        size: string;
        sizePerMinute: number;
    }[];
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
    duration: string;
    formats: {
        formatId: number;
        height: number;
        size: number;
        maxSize?: number;
        bitrate?: number;
    }[];
    audioFormats: {
        formatId: number;
        size: number;
    }[];
};

export type HumanizedFormat = {
    id: string;
    title: string;
    duration: string;
    videoFormats: {
        formatId: number;
        height: number;
        size: string;
        sizePerMinute: number;
        maxSize?: string;
    }[];
};

export type StorageData = {
    response: APIData | HumanizedFormat;
    isLive: boolean;
    expiry?: number;
    createdAt?: string;
};

export type BackgroundResponse = {
    success: boolean;
    data: APIData | HumanizedFormat | null;
    cached: boolean;
    isLive?: boolean;
    isShorts?: boolean;
    createdAt?: string; // Only when we use cached
    message?: string;
    api?: boolean; // Only when we use the server API
    executionTime?: string; // Only when we use the server API
};
