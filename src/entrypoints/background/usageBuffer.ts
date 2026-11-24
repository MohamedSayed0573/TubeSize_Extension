import type { Origin, VideoKey } from "@app-types/types";
import { typedEntries } from "@lib/utils";

export interface UsageSnapshot {
    origins: Record<Origin, number>;
    videos: Record<VideoKey, number>;
}

export class UsageBuffer {
    private origins: Record<Origin, number> = {};
    private videos: Record<VideoKey, number> = {};

    addOrigin(origin: Origin, bytes: number) {
        this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
    }

    addVideo(videoKey: VideoKey, bytes: number) {
        this.videos[videoKey] = (this.videos[videoKey] ?? 0) + bytes;
    }

    get hasPendingUsage(): boolean {
        return Object.keys(this.origins).length > 0 || Object.keys(this.videos).length > 0;
    }

    drain(): UsageSnapshot {
        const snapshot = { origins: this.origins, videos: this.videos };
        this.origins = {};
        this.videos = {};
        return snapshot;
    }

    restore(snapshot: UsageSnapshot) {
        for (const [origin, bytes] of typedEntries(snapshot.origins)) {
            this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
        }

        for (const [videoKey, bytes] of typedEntries(snapshot.videos)) {
            this.videos[videoKey] = (this.videos[videoKey] ?? 0) + bytes;
        }
    }
}
