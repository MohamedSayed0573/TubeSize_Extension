/**
 * Contract for a per-platform page module. Each supported site implements this
 * interface and registers itself in the `PLATFORMS` registry in `pageNavigation.ts`;
 * the generic dispatcher never needs to know which platform is active.
 */
export interface PlatformPage<TData> {
    // Whether this module handles the given page URL.
    matches(url: string): boolean;
    /**
     * Fetches the platform data from the background script for the given page.
     * @returns The platform data, or `undefined` if the URL is not a supported
     * video/stream page (e.g. a channel page) and nothing should be done.
     */
    init(url: string): Promise<TData | undefined>;
    // Optional platform-specific post-init hook (e.g. quality menu injection).
    afterInit?(data: TData): Promise<void>;
    // Starts the toast polling for the given platform data.
    startToaster(data: TData): Promise<void>;
}
