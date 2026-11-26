import { getMediaEstimateErrorCode, type MediaEstimateErrorCode } from "@lib/mediaEstimateError";
import { cn } from "@lib/utils";
import {
    AlertTriangle,
    Clock,
    Crown,
    Film,
    GlobeLock,
    Link2Off,
    Lock,
    LogIn,
    Radio,
    RefreshCw,
    VideoOff,
    WifiOff,
    type LucideIcon,
} from "lucide-react";

import { t, type MessageKey } from "@/i18n/t";

type ErrorTone = "neutral" | "error";
type RetryMode = "none" | "secondary" | "primary";

type ErrorPresentation = {
    icon: LucideIcon;
    titleKey: MessageKey;
    descriptionKey: MessageKey;
    tone: ErrorTone;
    retry: RetryMode;
};

const ICON_TONE_CLASSES: Record<ErrorTone, string> = {
    neutral: "text-zinc-300",
    error: "text-red-400",
};

const RETRY_BUTTON_CLASSES: Record<Exclude<RetryMode, "none">, string> = {
    secondary: "border-white/15 bg-white/8 text-neutral-50 hover:border-white/25 hover:bg-white/15",
    primary: "border-transparent bg-zinc-100 font-semibold text-zinc-950 hover:bg-white",
};

const ERROR_PRESENTATION: Record<MediaEstimateErrorCode, ErrorPresentation> = {
    stream_offline: {
        icon: Radio,
        titleKey: "popup_error_streamOffline_title",
        descriptionKey: "popup_error_streamOffline_description",
        tone: "neutral",
        retry: "secondary",
    },
    sign_in_required: {
        icon: LogIn,
        titleKey: "popup_error_signInRequired_title",
        descriptionKey: "popup_error_signInRequired_description",
        tone: "neutral",
        retry: "secondary",
    },
    members_only: {
        icon: Crown,
        titleKey: "popup_error_membersOnly_title",
        descriptionKey: "popup_error_membersOnly_description",
        tone: "neutral",
        retry: "secondary",
    },
    geo_blocked: {
        icon: GlobeLock,
        titleKey: "popup_error_geoBlocked_title",
        descriptionKey: "popup_error_geoBlocked_description",
        tone: "neutral",
        retry: "secondary",
    },
    restricted_content: {
        icon: Lock,
        titleKey: "popup_error_restrictedContent_title",
        descriptionKey: "popup_error_restrictedContent_description",
        tone: "neutral",
        retry: "secondary",
    },
    unavailable: {
        icon: VideoOff,
        titleKey: "popup_error_unavailable_title",
        descriptionKey: "popup_error_unavailable_description",
        tone: "neutral",
        retry: "secondary",
    },
    rate_limited: {
        icon: Clock,
        titleKey: "popup_error_rateLimited_title",
        descriptionKey: "popup_error_rateLimited_description",
        tone: "neutral",
        retry: "secondary",
    },
    network_error: {
        icon: WifiOff,
        titleKey: "popup_error_networkError_title",
        descriptionKey: "popup_error_networkError_description",
        tone: "error",
        retry: "primary",
    },
    no_formats: {
        icon: Film,
        titleKey: "popup_error_noFormats_title",
        descriptionKey: "popup_error_noFormats_description",
        tone: "neutral",
        retry: "secondary",
    },
    unsupported_url: {
        icon: Link2Off,
        titleKey: "popup_error_unsupportedUrl_title",
        descriptionKey: "popup_error_unsupportedUrl_description",
        tone: "neutral",
        retry: "none",
    },
    unknown: {
        icon: AlertTriangle,
        titleKey: "popup_error_unknown_title",
        descriptionKey: "popup_error_unknown_description",
        tone: "error",
        retry: "primary",
    },
};

type Props = {
    error: unknown;
    isRetrying: boolean;
    onRetry: () => void;
};

export default function MediaEstimateErrorCard({ error, isRetrying, onRetry }: Props) {
    const code = getMediaEstimateErrorCode(error);
    const presentation = ERROR_PRESENTATION[code];
    const Icon = presentation.icon;

    return (
        <div
            role="alert"
            data-error-code={code}
            className="flex flex-col items-center gap-1.5 px-1.5 pt-3 pb-1.5 text-center"
        >
            <div
                className="mb-0.5 flex size-8 items-center justify-center rounded-lg border border-white/10 bg-white/5"
                aria-hidden="true"
            >
                <Icon className={cn("size-3.5 shrink-0", ICON_TONE_CLASSES[presentation.tone])} />
            </div>
            <div className="text-[12.5px] font-semibold text-neutral-50">
                {t(presentation.titleKey)}
            </div>
            <p className="max-w-[202px] text-[11px] leading-relaxed text-zinc-400">
                {t(presentation.descriptionKey)}
            </p>
            {presentation.retry !== "none" && (
                <button
                    type="button"
                    disabled={isRetrying}
                    onClick={onRetry}
                    className={cn(
                        "mt-1.5 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-65",
                        RETRY_BUTTON_CLASSES[presentation.retry],
                    )}
                >
                    <RefreshCw
                        className={cn("size-3 shrink-0", isRetrying && "animate-spin")}
                        aria-hidden="true"
                    />
                    <span>{isRetrying ? t("common_retrying") : t("common_retry")}</span>
                </button>
            )}
        </div>
    );
}
