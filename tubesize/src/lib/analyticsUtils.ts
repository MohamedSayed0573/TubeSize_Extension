import { getFromLocalCache } from "./cache";

export type UsageByDay = Record<string, Record<string, { usage: number }>>;

export async function getUsageByDay() {
    return ((await getFromLocalCache("usageByDay")) ?? {}) as Record<
        string,
        Record<string, { usage: number }>
    >;
}

export function transformData(usageByDay: UsageByDay | undefined) {
    if (!usageByDay) return {};
    const data: Record<string, number> = {};
    for (const [day, videoItags] of Object.entries(usageByDay)) {
        let total = 0;
        for (const [_videoItag, { usage }] of Object.entries(videoItags)) {
            total += usage;
        }
        data[day] = total;
    }
    return data;
}
