import { getFromLocalCache } from "./cache";

export type UsageByDay = {
    [date: string]: {
        [videoId: string]: {
            usage: number;
            title: string | undefined;
            thumbnailUrl: string | undefined;
        };
    };
};

export type UsageByVideo = {
    [videoId: string]: {
        usage: number;
        title: string | undefined;
        thumbnailUrl: string | undefined;
    };
};
export async function getUsageByDay(): Promise<UsageByDay> {
    return ((await getFromLocalCache("usageByDay")) ?? {}) as UsageByDay;
}

export function utcDateKey(date: Date) {
    return date.toISOString().slice(0, 10);
}

export function isEmptyUsageByDay(usage: UsageByDay) {
    return (
        Object.keys(usage).length === 0 ||
        Object.values(usage).every((videos) =>
            Object.values(videos).every((video) => video.usage === 0),
        )
    );
}

export function isEmptyUsageByVideo(usage: UsageByVideo) {
    return (
        Object.keys(usage).length === 0 || Object.values(usage).every((video) => video.usage === 0)
    );
}
