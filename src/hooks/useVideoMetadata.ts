import { getAllVideoMetadata, getVideoMetadataByVideoKey, type VideoMetadata } from "@/db";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export function useVideoMetadata(): UseQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: string[]): UseQueryResult<VideoMetadata[] | null>;
export function useVideoMetadata(videoKey: string): UseQueryResult<VideoMetadata | null>;
export function useVideoMetadata(videoKey?: string | string[]) {
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
