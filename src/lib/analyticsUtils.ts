import { getFromLocalCache } from "@lib/cache";
import { filesize } from "filesize";

export type UsageByDay = {
    [date: string]: {
        [videoId: string]: {
            usage: number;
            title: string | undefined;
            thumbnailUrl: string | undefined;
            channelName: string | undefined;
        };
    };
};

// export type UsageByVideo = {
//     [videoId: string]: {
//         usage: number;
//         title: string | undefined;
//         thumbnailUrl: string | undefined;
//         channelName: string | undefined;
//     };
// };

export async function getUsageByDay() {
    return (await getFromLocalCache<UsageByDay>("usageByDay")) ?? null;
}

/**
 * Returns the date key for a given date in the format "YYYY-MM-DD".
 * @example "2023-05-15"
 */
export function getDateKey(date: Date) {
    return new Intl.DateTimeFormat("en-CA").format(date);
}

/**
 * Formats a date or date range into a human-readable string.
 * @example new Date("2023-05-15") -> "May 15, 2023"
 * @example [new Date("2023-05-15"), new Date("2023-05-16")] -> "May 15 – 16, 2023"
 */
export function formatDate(date: Date | Date[]) {
    const dtf = new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    });

    if (!Array.isArray(date)) {
        return dtf.format(new Date(date));
    }

    if (date.length === 0) {
        return "No data";
    }

    return dtf.formatRange(new Date(date[0]!), new Date(date.at(-1)!));
}

export function isEmptyUsageByDay(usage: UsageByDay) {
    return (
        Object.keys(usage).length === 0 ||
        Object.values(usage).every((videos) =>
            Object.values(videos).every((video) => video.usage === 0),
        )
    );
}

export function getLastDays(count: number): Date[] {
    const days = Array.from({ length: count }, (_, index) => {
        const date = new Date();
        date.setDate(date.getDate() - index);
        return date;
    });

    return days.toReversed();
}

export function getNumVideosWatched(usageByDay: UsageByDay) {
    let count = 0;
    for (const day in usageByDay) {
        count += Object.keys(usageByDay[day] ?? {}).length;
    }
    return count;
}

/**
 * Formats bytes as a human-readable string.
 * @example formatBytes(1024) returns "1 KB"
 */
export function formatBytes(bytes: number, options?: { round: number }) {
    return filesize(bytes, { base: 10, standard: "jedec", round: 2, ...options });
}

export function getSortedVideoUsageRows(lifeTimeUsage: UsageByDay) {
    return Object.entries(lifeTimeUsage)
        .flatMap(([date, videos]) => {
            return Object.entries(videos).map(([videoTag, details]) => ({
                videoTag,
                date,
                ...details,
            }));
        })
        .toSorted((a, b) => b.usage - a.usage);
}

export function getUsageNumber(usage: UsageByDay): number {
    let total = 0;
    for (const videos of Object.values(usage)) {
        for (const video of Object.values(videos)) {
            total += video.usage;
        }
    }
    return total;
}

export function getLast7DaysUsage(usageByDay: UsageByDay) {
    const last7Days = getLastDays(7).map((date) => getDateKey(date));
    const weekUsage: UsageByDay = {};

    for (const day of last7Days) {
        if (usageByDay[day]) {
            weekUsage[day] = usageByDay[day];
        }
    }

    return weekUsage;
}

export function getLast30DaysUsage(usageByDay: UsageByDay) {
    const last30Days = getLastDays(30).map((date) => getDateKey(date));
    const monthUsage: UsageByDay = {};

    for (const day of last30Days) {
        if (usageByDay[day] !== undefined) {
            monthUsage[day] = usageByDay[day];
        }
    }

    return monthUsage;
}

export function getTodayUsage(usageByDay: UsageByDay): UsageByDay {
    const today = getDateKey(new Date());
    const date = usageByDay[today] ?? {};
    return {
        [today]: date,
    };
}

export function getUsageByDate(usageByDay: UsageByDay, date: string): UsageByDay {
    return {
        [date]: usageByDay[date] ?? {},
    };
}
