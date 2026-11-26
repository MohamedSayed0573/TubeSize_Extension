import type { DisplayFormat, MediaEstimate } from "@app-types/platforms.types";
import { getAv1Support } from "@lib/codecSupport";
import { humanizeDuration } from "@lib/humanize";
import { isMediaEstimateErrorCode, MediaEstimateError } from "@lib/mediaEstimateError";
import { getPlatformDisplayName, parsePlatformUrl } from "@lib/platformUrl";

import { getLanguage } from "@/i18n/language";
import { t } from "@/i18n/t";
import { sendBackgroundMessage } from "@/messaging";

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

export async function requestMediaEstimate(
    url: string,
    options?: EstimateMediaOptions,
): Promise<MediaEstimate> {
    const parsed = parsePlatformUrl(url);
    if (parsed?.kind !== "media") {
        throw new MediaEstimateError("unsupported_url", "Unsupported or non-media URL");
    }

    let av1Supported: boolean | undefined;
    try {
        av1Supported = await getAv1Support();
    } catch (err) {
        console.error("Failed to detect AV1 support", err);
    }

    const response = await sendBackgroundMessage("estimateMedia", {
        url,
        isFromPopup: options?.isFromPopup,
        html: options?.html,
        av1Supported,
    });

    if (!response.success) {
        const code = isMediaEstimateErrorCode(response.errorCode) ? response.errorCode : "unknown";
        throw new MediaEstimateError(code, response.message);
    }

    return response.data;
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
        return estimate.formats.map((format) => ({
            ...format,
            key: format.formatId ?? format.resolution,
            sizeBytes: format.sizeBytes + audioSizeBytes,
            sizePerSecondBytes: format.sizePerSecondBytes + audioBytesPerSecond,
            ...(estimate.isShorts ? { hideRate: true } : {}),
        }));
    }

    return estimate.formats.map((format) => ({
        ...format,
        key: format.formatId ?? format.resolution,
        sizePerSecondBytes: format.sizePerSecondBytes + audioBytesPerSecond,
    }));
}

export function formatEstimateHeader(estimate: MediaEstimate): HeaderViewData {
    const language = getLanguage();
    const platformName = getPlatformDisplayName(estimate.platform);

    if (estimate.contentType === "live") {
        return {
            title:
                estimate.channelName || estimate.title || t("popup_platformLive", [platformName]),
        };
    }

    return {
        title: estimate.title || t("popup_platformVideo", [platformName]),
        duration:
            estimate.durationSeconds > 0
                ? humanizeDuration(estimate.durationSeconds * 1000, language)
                : undefined,
    };
}
