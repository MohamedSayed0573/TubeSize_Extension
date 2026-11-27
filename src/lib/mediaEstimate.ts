import type { DisplayFormat, EstimateSource, MediaEstimate } from "@app-types/platforms.types";
import type { DetectedVideo } from "@app-types/types";
import { getAv1Support } from "@lib/codecSupport";
import { humanizeDuration } from "@lib/humanize";
import { isMediaEstimateErrorCode, MediaEstimateError } from "@lib/mediaEstimateError";
import { getPlatformDisplayName, parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { type BackgroundResponse, sendBackgroundMessage } from "@/messaging";

export type EstimateMediaOptions = {
    html?: string;
    isFromPopup?: boolean;
};

export type FormatProjectionOptions = {
    includeAudio?: boolean;
};

export type HeaderViewData = {
    title: string;
    duration?: string;
};

function unwrapEstimateResponse(response: BackgroundResponse<MediaEstimate>): MediaEstimate {
    if (!response.success) {
        const code = isMediaEstimateErrorCode(response.errorCode) ? response.errorCode : "unknown";
        throw new MediaEstimateError(code, response.message);
    }
    return response.data;
}

async function detectAv1Support(): Promise<boolean | undefined> {
    try {
        return await getAv1Support();
    } catch (err) {
        console.error("Failed to detect AV1 support", err);
        return undefined;
    }
}

export async function requestMediaEstimate(
    url: string,
    options?: EstimateMediaOptions,
): Promise<MediaEstimate> {
    const parsed = parsePlatformUrl(url);
    if (parsed?.kind !== "media") {
        throw new MediaEstimateError("unsupported_url", "Unsupported or non-media URL");
    }

    const av1Supported = await detectAv1Support();

    const response = await sendBackgroundMessage("estimateMedia", {
        url,
        isFromPopup: options?.isFromPopup,
        html: options?.html,
        av1Supported,
    });

    return unwrapEstimateResponse(response);
}

export async function requestGenericMediaEstimate(video: DetectedVideo): Promise<MediaEstimate> {
    if (video.source.kind === "platform-embed") {
        const av1Supported = await detectAv1Support();
        const response = await sendBackgroundMessage("estimateMedia", {
            url: video.source.url,
            isFromPopup: true,
            av1Supported,
        });
        return unwrapEstimateResponse(response);
    }

    const response = await sendBackgroundMessage("estimateMedia", {
        url: video.source.url,
        isFromPopup: true,
        generic: {
            ...video.source,
            ...(video.title ? { title: video.title } : {}),
        },
    });

    return unwrapEstimateResponse(response);
}

export function projectEstimateFormats(
    estimate: MediaEstimate,
    options?: FormatProjectionOptions,
): DisplayFormat[] {
    const includeAudio = options?.includeAudio ?? true;
    const audio = includeAudio ? estimate.audio : undefined;
    const audioSizeBytes = audio?.sizeBytes ?? 0;
    const audioBytesPerSecond = audio?.bytesPerSecond ?? 0;

    if (estimate.contentType === "vod") {
        return estimate.formats.map((format) => {
            const totalRate = format.sizePerSecondBytes + audioBytesPerSecond;
            const hideRate = Boolean(estimate.isShorts) || totalRate <= 0;
            return {
                ...format,
                key: format.formatId ?? format.resolution,
                sizeBytes: format.sizeBytes + audioSizeBytes,
                sizePerSecondBytes: totalRate,
                ...(hideRate ? { hideRate: true } : {}),
            };
        });
    }

    return estimate.formats.map((format) => ({
        ...format,
        key: format.formatId ?? format.resolution,
        sizePerSecondBytes: format.sizePerSecondBytes + audioBytesPerSecond,
    }));
}

function formatFallbackTitle(
    platform: EstimateSource,
    contentType: MediaEstimate["contentType"],
): string {
    if (platform === "generic") {
        return t("popup_genericVideo");
    }
    const platformName = getPlatformDisplayName(platform);
    return contentType === "live"
        ? t("popup_platformLive", [platformName])
        : t("popup_platformVideo", [platformName]);
}

export function formatEstimateHeader(estimate: MediaEstimate): HeaderViewData {
    const language = getLanguage();
    const fallbackTitle = formatFallbackTitle(estimate.platform, estimate.contentType);

    if (estimate.contentType === "live") {
        return {
            title: estimate.channelName || estimate.title || fallbackTitle,
        };
    }

    return {
        title: estimate.title || fallbackTitle,
        duration:
            estimate.durationSeconds > 0
                ? humanizeDuration(estimate.durationSeconds * 1000, language)
                : undefined,
    };
}
