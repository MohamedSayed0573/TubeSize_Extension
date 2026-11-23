import type { VideoKey } from "@app-types/types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { getAllVideoMetadata, getVideoMetadataByVideoKey, type VideoMetadata } from "@/db";

export function useVideoMetadata(): UseQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: VideoKey[]): UseQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: VideoKey): UseQueryResult<VideoMetadata | null>;
export function useVideoMetadata(videoKey?: VideoKey | VideoKey[]) {
    return useQuery({
        queryKey: ["videoMetaData", videoKey],
        queryFn: async () => {
            if (!videoKey) return (await getAllVideoMetadata()) ?? null;

            if (Array.isArray(videoKey)) {
                return await getVideoMetadataByVideoKey(videoKey);
            }

            return (await getVideoMetadataByVideoKey(videoKey)) ?? null;
        },
    });
}
