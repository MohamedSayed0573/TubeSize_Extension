export function extractVideoTag(url: string) {
    try {
        const parsedUrl = new URL(url);
        const videoTag = parsedUrl.searchParams.get("v");
        if (!videoTag) return;

        const regex = /^[a-zA-Z0-9_-]{11}$/;
        if (!regex.test(videoTag)) {
            return;
        }
        return videoTag;
    } catch (err) {
        console.error(err);
    }
}
