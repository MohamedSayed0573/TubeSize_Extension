import { waitForElement } from "@lib/dom";

export async function getCurrentResolution(signal?: AbortSignal): Promise<number | undefined> {
    const video = await waitForElement<HTMLVideoElement>("video", {
        signal,
        predicate: (element) => element.videoHeight > 0,
    });
    return video?.videoHeight;
}

export async function trackResolutionChanges(
    onResolutionChange: (resolution: number) => void,
    signal: AbortSignal,
): Promise<void> {
    await getCurrentResolution(signal);
    if (signal.aborted) return;

    const video = document.querySelector("video");
    if (!video) return;

    let lastResolution: number | undefined;
    const handleResize = () => {
        if (signal.aborted) return;
        const resolution = video.videoHeight;
        if (!resolution || resolution === lastResolution) return;
        lastResolution = resolution;
        onResolutionChange(resolution);
    };

    handleResize();
    if (signal.aborted) return;

    video.addEventListener("resize", handleResize);
    signal.addEventListener("abort", () => video.removeEventListener("resize", handleResize), {
        once: true,
    });
}
