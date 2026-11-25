import type { MediaEstimate } from "@app-types/platforms.types";
import type { EstimateMediaMessage } from "@app-types/types";
import { estimateKick } from "@lib/kick";
import { MediaEstimateError } from "@lib/mediaEstimateError";
import { parsePlatformUrl, type ParsedPlatformMedia } from "@lib/platformUrl";
import { estimateTwitch } from "@lib/twitch";
import { estimateYoutube } from "@lib/youtube";

type EstimateContext = {
    isFromPopup: boolean;
    html?: string;
    av1Supported?: boolean;
};

function dispatchEstimate(
    media: ParsedPlatformMedia,
    context: EstimateContext,
): Promise<MediaEstimate> {
    switch (media.platform) {
        case "youtube":
            return estimateYoutube(media, context);
        case "twitch":
            return estimateTwitch(media, context);
        case "kick":
            return estimateKick(media, context);
        default: {
            const exhaustive: never = media;
            return exhaustive;
        }
    }
}

export async function estimateMedia(message: EstimateMediaMessage): Promise<MediaEstimate> {
    const parsed = parsePlatformUrl(message.url);
    if (parsed?.kind !== "media") {
        throw new MediaEstimateError("unsupported_url", "Unsupported or non-media URL");
    }

    const estimate = await dispatchEstimate(parsed, {
        isFromPopup: message.isFromPopup ?? true,
        html: message.html,
        av1Supported: message.av1Supported,
    });

    if (estimate.formats.length === 0) {
        throw new MediaEstimateError("no_formats", "No video formats found for this video");
    }

    return estimate;
}
