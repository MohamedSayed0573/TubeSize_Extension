export type RawData = {
    id: string;
    title: string;
    duration: number;
    formats: {
        format_id: string;
        height: number;
        filesize: number;
    }[];
};

export type BaseData<T> = {
    id: string;
    title: string;
    duration: T;
    audioFormat: T;
    videoFormats: {
        formatId: number;
        height: number;
        size: T;
    }[];
};

export type Data = BaseData<number>;

export type HumanizedData = BaseData<string>;
