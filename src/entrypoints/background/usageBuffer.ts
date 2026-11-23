import type { Origin, VideoKey } from "@app-types/types";
import { typedEntries } from "@lib/utils";

/**
 * Byte accumulators for the current flush window.
 *
 * `chrome.webRequest.onCompleted` fires for every request, so counts are kept in
 * memory and written to IndexedDB in batches by usageTracker.ts.
 */
export interface UsageSnapshot {
    origins: Record<Origin, number>;
    videos: Record<VideoKey, number>;
}

export class UsageBuffer {
    private origins: Record<Origin, number> = {};
    private videos: Record<VideoKey, number> = {};

    /**
     * Adds `bytes` to the running total for a page origin.
     */
    addOrigin(origin: Origin, bytes: number) {
        this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
    }

    /**
     * Adds `bytes` to the running total for a `<platform>:<id>` video key.
     */
    addVideo(videoKey: VideoKey, bytes: number) {
        this.videos[videoKey] = (this.videos[videoKey] ?? 0) + bytes;
    }

    get hasPendingUsage(): boolean {
        return Object.keys(this.origins).length > 0 || Object.keys(this.videos).length > 0;
    }

    /**
     * Resets and returns everything accumulated so far.
     */
    drain(): UsageSnapshot {
        const snapshot = { origins: this.origins, videos: this.videos };
        this.origins = {};
        this.videos = {};
        return snapshot;
    }

    /**
     * Merges a previously drained snapshot back into the accumulators.
     *
     * Merging (rather than overwriting) keeps any bytes that arrived while
     * the failed flush was in flight.
     */
    restore(snapshot: UsageSnapshot) {
        for (const [origin, bytes] of typedEntries(snapshot.origins)) {
            this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
        }

        for (const [videoKey, bytes] of typedEntries(snapshot.videos)) {
            this.videos[videoKey] = (this.videos[videoKey] ?? 0) + bytes;
        }
    }
}
