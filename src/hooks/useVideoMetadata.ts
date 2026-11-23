import type { VideoKey } from "@app-types/types";

import { getAllVideoMetadata, getVideoMetadataByVideoKey, type VideoMetadata } from "@/db";

import { useLiveDbQuery, type LiveQueryResult } from "./useLiveDbQuery";

export function useVideoMetadata(): LiveQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: VideoKey[]): LiveQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: VideoKey): LiveQueryResult<VideoMetadata | null>;
export function useVideoMetadata(videoKey?: VideoKey | VideoKey[]) {
    const dep = Array.isArray(videoKey) ? videoKey.join(",") : (videoKey ?? "");
    return useLiveDbQuery(async () => {
        if (!videoKey) return (await getAllVideoMetadata()) ?? null;

        if (Array.isArray(videoKey)) {
            return await getVideoMetadataByVideoKey(videoKey);
        }

        return (await getVideoMetadataByVideoKey(videoKey)) ?? null;
    }, [dep]);
}
