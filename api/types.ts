export type RawDataFormat = {
    id: string;
    title: string;
    duration?: number;
    formats: Array<{
        format_id: string;
        filesize: number;
        filesize_approx: number;
        height: number;
        fragments?: Array<{
            rawDuration: number;
        }>;
    }>;
};

export type Data = {
    id: string;
    title: string;
    duration: number | null;
    audioFormat: number | null;
    videoFormats: {
        formatId: string;
        height: number;
        size: number;
    }[];
};

export type HumanizedData = {
    id: string;
    title: string;
    duration: string;
    audioFormat: string;
    videoFormats: {
        formatId: string;
        height: number;
        size: string;
    }[];
};
