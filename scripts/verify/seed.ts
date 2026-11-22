/* oxlint-disable unicorn/consistent-function-scoping -- serialized into Playwright page.evaluate */
import type { Page } from "playwright-core";

export type SeedMode = "full" | "empty";

export interface DbSnapshot {
    siteUsageDays: number;
    watchHistoryDays: number;
    videoMetaCount: number;
    latestDay: string | null;
    totalBytes: number;
}

export async function applySeed(page: Page, mode: SeedMode): Promise<DbSnapshot> {
    return await page.evaluate(async (seedMode: SeedMode): Promise<DbSnapshot> => {
        const DB_NAME = "TubeSize";
        const MB = 1024 * 1024;
        let s = 0x54756265;
        const rand = (min: number, max: number) => {
            s = (s + 0x6d2b79f5) | 0;
            let t = Math.imul(s ^ (s >>> 15), 1 | s);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min + 1)) + min;
        };
        const dayStr = (d: Date) => new Intl.DateTimeFormat("en-CA").format(d);
        const reqDone = <T>(r: IDBRequest<T>) =>
            new Promise<T>((res, rej) => {
                r.addEventListener("success", () => res(r.result), { once: true });
                r.addEventListener("error", () => rej(r.error), { once: true });
            });
        const txDone = (tx: IDBTransaction) =>
            new Promise<void>((res, rej) => {
                tx.addEventListener("complete", () => res(), { once: true });
                tx.addEventListener("error", () => rej(tx.error), { once: true });
                tx.addEventListener("abort", () => rej(tx.error), { once: true });
            });
        const openAt = (ver?: number) =>
            new Promise<IDBDatabase>((res, rej) => {
                const req = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
                req.addEventListener(
                    "upgradeneeded",
                    () => {
                        const d = req.result;
                        if (!d.objectStoreNames.contains("siteUsage"))
                            d.createObjectStore("siteUsage", { keyPath: "day" });
                        if (!d.objectStoreNames.contains("watchHistory"))
                            d.createObjectStore("watchHistory", { keyPath: "day" });
                        if (!d.objectStoreNames.contains("videoMetaData"))
                            d.createObjectStore("videoMetaData", { keyPath: "videoKey" });
                    },
                    { once: true },
                );
                req.addEventListener("success", () => res(req.result), { once: true });
                req.addEventListener("error", () => rej(req.error), { once: true });
            });

        let db = await openAt();
        if (!db.objectStoreNames.contains("siteUsage")) {
            const next = Math.max(db.version + 1, 10); // Dexie v1 -> IndexedDB v10
            db.close();
            db = await openAt(next);
        }

        try {
            const stores = ["siteUsage", "watchHistory", "videoMetaData"] as const;
            const clearTx = db.transaction([...stores], "readwrite");
            await Promise.all(stores.map((n) => reqDone(clearTx.objectStore(n).clear())));
            await txDone(clearTx);

            if (seedMode === "empty") {
                return {
                    siteUsageDays: 0,
                    watchHistoryDays: 0,
                    videoMetaCount: 0,
                    latestDay: null,
                    totalBytes: 0,
                };
            }

            const yt = [
                {
                    tag: "rfscVS0vtbw",
                    title: "Learn Python - Full Course for Beginners",
                    ch: "freeCodeCamp.org",
                    url: "https://www.youtube.com/@freecodecamp",
                },
                {
                    tag: "w7ejDZ8SWv8",
                    title: "React in 100 Seconds",
                    ch: "Fireship",
                    url: "https://www.youtube.com/@Fireship",
                },
                {
                    tag: "wKBu_dEaF9E",
                    title: "تعلم البرمجة من الصفر | الدرس الأول",
                    ch: "Elzero Web School",
                    url: "https://www.youtube.com/@ElzeroWebSchool",
                },
            ];
            const meta = [
                ...yt.map((v) => ({
                    videoKey: `youtube:${v.tag}`,
                    type: "youtube",
                    videoTag: v.tag,
                    title: v.title,
                    channelName: v.ch,
                    channelUrl: v.url,
                    thumbnailUrl: "",
                })),
                {
                    videoKey: "twitch:1234567890",
                    type: "twitch",
                    videoTag: "1234567890",
                    title: "Ranked grind to Radiant — full VOD",
                    channelName: "shroud",
                    channelUrl: "https://www.twitch.tv/shroud",
                    thumbnailUrl: "",
                    contentType: "vod",
                    url: "https://www.twitch.tv/videos/1234567890",
                },
                {
                    videoKey: "twitch:shroud",
                    type: "twitch",
                    videoTag: "shroud",
                    title: "shroud — Live",
                    channelName: "shroud",
                    channelUrl: "https://www.twitch.tv/shroud",
                    thumbnailUrl: "",
                    contentType: "live",
                    url: "https://www.twitch.tv/shroud",
                },
                {
                    videoKey: "kick:kick-vod-98231",
                    type: "kick",
                    videoTag: "kick-vod-98231",
                    title: "GTA RP — full session",
                    channelName: "xqc",
                    channelUrl: "https://kick.com/xqc",
                    thumbnailUrl: "",
                    contentType: "vod",
                    url: "https://kick.com/video/kick-vod-98231",
                },
            ];

            const siteRows: Array<{ day: string; usage: Record<string, number> }> = [];
            const historyRows: Array<{ day: string; videos: Record<string, number> }> = [];
            let totalBytes = 0;

            for (let ago = 13; ago >= 0; ago--) {
                const d = new Date();
                d.setDate(d.getDate() - ago);
                const day = dayStr(d);
                const ytB = rand(250 * MB, 1400 * MB);
                const twB = rand(120 * MB, 650 * MB);
                const kkB = rand(60 * MB, 300 * MB);
                const ghB = rand(15 * MB, 90 * MB);
                const usage = {
                    "https://www.youtube.com": ytB,
                    "https://m.youtube.com": Math.round(ytB * 0.08),
                    "https://www.twitch.tv": twB,
                    "https://www.kick.com": kkB,
                    "https://github.com": ghB,
                };
                totalBytes += Object.values(usage).reduce((a, b) => a + b, 0);
                const v = yt[ago % yt.length]!;
                siteRows.push({ day, usage });
                historyRows.push({
                    day,
                    videos: {
                        [`youtube:${v.tag}`]: Math.round(ytB * 0.8),
                        [ago % 2 === 0 ? "twitch:1234567890" : "twitch:shroud"]: Math.round(
                            twB * 0.8,
                        ),
                        "kick:kick-vod-98231": Math.round(kkB * 0.8),
                    },
                });
            }

            const putAll = async (store: string, rows: unknown[]) => {
                const tx = db.transaction([store], "readwrite");
                await Promise.all(rows.map((r) => reqDone(tx.objectStore(store).put(r))));
                await txDone(tx);
            };
            await putAll("siteUsage", siteRows);
            await putAll("watchHistory", historyRows);
            await putAll("videoMetaData", meta);

            return {
                siteUsageDays: siteRows.length,
                watchHistoryDays: historyRows.length,
                videoMetaCount: meta.length,
                latestDay: siteRows.at(-1)?.day ?? null,
                totalBytes,
            };
        } finally {
            db.close();
        }
    }, mode);
}

export async function inspectDb(page: Page): Promise<DbSnapshot> {
    return await page.evaluate(async (): Promise<DbSnapshot> => {
        const reqDone = <T>(r: IDBRequest<T>) =>
            new Promise<T>((res, rej) => {
                r.addEventListener("success", () => res(r.result), { once: true });
                r.addEventListener("error", () => rej(r.error), { once: true });
            });
        const db = await reqDone(indexedDB.open("TubeSize"));
        try {
            if (!db.objectStoreNames.contains("siteUsage")) {
                return {
                    siteUsageDays: 0,
                    watchHistoryDays: 0,
                    videoMetaCount: 0,
                    latestDay: null,
                    totalBytes: 0,
                };
            }
            const tx = db.transaction(["siteUsage", "watchHistory", "videoMetaData"], "readonly");
            const [sites, hist, meta] = await Promise.all([
                reqDone<Array<{ day: string; usage: Record<string, number> }>>(
                    tx.objectStore("siteUsage").getAll(),
                ),
                reqDone<unknown[]>(tx.objectStore("watchHistory").getAll()),
                reqDone<unknown[]>(tx.objectStore("videoMetaData").getAll()),
            ]);
            const days = sites.map((r) => r.day).sort();
            const totalBytes = sites.reduce(
                (s, r) => s + Object.values(r.usage ?? {}).reduce((a, b) => a + b, 0),
                0,
            );
            return {
                siteUsageDays: sites.length,
                watchHistoryDays: hist.length,
                videoMetaCount: meta.length,
                latestDay: days.at(-1) ?? null,
                totalBytes,
            };
        } finally {
            db.close();
        }
    });
}
