import { getFromLocalCache } from "./cache";
import { filesize } from "filesize";

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

export function getLast7Days(): Date[] {
    const days = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        days.push(date);
    }

    return days;
}

export function getLast30Days(): Date[] {
    const days = [];

    for (let i = 29; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        days.push(date);
    }

    return days;
}

export function getNumVideosWatched(usageByDay: UsageByDay) {
    let count = 0;
    for (const day in usageByDay) {
        count += Object.keys(usageByDay[day] ?? {}).length;
    }
    return count;
}

export function formatBytes(bytes: number, options?: { round: number }) {
    return filesize(bytes, { base: 10, standard: "jedec", round: 2, ...options });
}

export function getTotalUsageForDate(usageByDay: UsageByDay, date: string) {
    let total = 0;
    for (const [_videoTag, { usage }] of Object.entries(usageByDay[date] ?? {})) {
        total += usage;
    }
    return total;
}
