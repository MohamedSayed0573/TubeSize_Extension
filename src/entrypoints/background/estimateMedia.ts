import type { MediaEstimate } from "@app-types/platforms.types";
import type { EstimateMediaMessage } from "@app-types/types";
import { estimateGenericMedia } from "@lib/genericMedia";
import { estimateKick } from "@lib/kick";
import { MediaEstimateError } from "@lib/mediaEstimateError";
import {
    parseEmbeddedPlatformUrl,
    parsePlatformUrl,
    type ParsedPlatformMedia,
} from "@lib/platformUrl";
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
    let estimate: MediaEstimate;

    if (message.generic) {
        estimate = await estimateGenericMedia(message.generic, message.generic.title);
    } else {
        const topLevel = parsePlatformUrl(message.url);
        const parsed =
            topLevel?.kind === "media" ? topLevel : parseEmbeddedPlatformUrl(message.url)?.parsed;
        if (!parsed) {
            throw new MediaEstimateError("unsupported_url", "Unsupported or non-media URL");
        }

        estimate = await dispatchEstimate(parsed, {
            isFromPopup: message.isFromPopup ?? true,
            html: message.html,
            av1Supported: message.av1Supported,
        });
    }

    if (estimate.formats.length === 0) {
        throw new MediaEstimateError("no_formats", "No video formats found for this video");
    }

    return estimate;
}
