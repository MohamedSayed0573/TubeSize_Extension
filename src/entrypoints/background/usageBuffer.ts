/**
 * Byte accumulators for the current flush window.
 *
 * `chrome.webRequest.onCompleted` fires for every request, so counts are kept in
 * memory and written to IndexedDB in batches by usageTracker.ts.
 */
type BytesByKey = Record<string, number>;

export interface UsageSnapshot {
    origins: BytesByKey;
    videos: BytesByKey;
}

export class UsageBuffer {
    private origins: BytesByKey = {};
    private videos: BytesByKey = {};

    /**
     * Adds `bytes` to the running total for a page origin.
     */
    addOrigin(origin: string, bytes: number) {
        this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
    }

    /**
     * Adds `bytes` to the running total for a `<platform>:<id>` video key.
     */
    addVideo(videoKey: string, bytes: number) {
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
        for (const [origin, bytes] of Object.entries(snapshot.origins)) {
            this.origins[origin] = (this.origins[origin] ?? 0) + bytes;
        }

        for (const [videoKey, bytes] of Object.entries(snapshot.videos)) {
            this.videos[videoKey] = (this.videos[videoKey] ?? 0) + bytes;
        }
    }
}
