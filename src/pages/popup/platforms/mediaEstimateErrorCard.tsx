import { getMediaEstimateErrorCode, type MediaEstimateErrorCode } from "@lib/mediaEstimateError";
import { cn } from "@lib/utils";
import {
    AlertTriangle,
    Film,
    Link2Off,
    Lock,
    Radio,
    RefreshCw,
    VideoOff,
    WifiOff,
    type LucideIcon,
} from "lucide-react";

import { t, type MessageKey } from "@/i18n/t";

type ErrorPresentation = {
    icon: LucideIcon;
    titleKey: MessageKey;
    descriptionKey: MessageKey;
    cardClassName: string;
    iconClassName: string;
    canRetry: boolean;
    retryButtonClassName?: string;
};

const SECONDARY_RETRY_BUTTON =
    "border-white/12 bg-white/8 text-neutral-100 hover:border-white/20 hover:bg-white/15";

const PROMINENT_RETRY_BUTTON =
    "border-red-400/40 bg-red-500/20 text-red-100 hover:border-red-400/60 hover:bg-red-500/30";

const ERROR_PRESENTATION: Record<MediaEstimateErrorCode, ErrorPresentation> = {
    stream_offline: {
        icon: Radio,
        titleKey: "popup_error_streamOffline_title",
        descriptionKey: "popup_error_streamOffline_description",
        cardClassName: "border-amber-500/25 border-s-amber-400 bg-amber-500/10",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    restricted_content: {
        icon: Lock,
        titleKey: "popup_error_restrictedContent_title",
        descriptionKey: "popup_error_restrictedContent_description",
        cardClassName: "border-amber-500/25 border-s-amber-400 bg-amber-500/10",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    unavailable: {
        icon: VideoOff,
        titleKey: "popup_error_unavailable_title",
        descriptionKey: "popup_error_unavailable_description",
        cardClassName: "border-white/12 border-s-zinc-400 bg-white/5",
        iconClassName: "text-zinc-300",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    network_error: {
        icon: WifiOff,
        titleKey: "popup_error_networkError_title",
        descriptionKey: "popup_error_networkError_description",
        cardClassName: "border-red-500/30 border-s-red-400 bg-red-500/10",
        iconClassName: "text-red-400",
        canRetry: true,
        retryButtonClassName: PROMINENT_RETRY_BUTTON,
    },
    no_formats: {
        icon: Film,
        titleKey: "popup_error_noFormats_title",
        descriptionKey: "popup_error_noFormats_description",
        cardClassName: "border-amber-500/25 border-s-amber-400 bg-amber-500/10",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    unsupported_url: {
        icon: Link2Off,
        titleKey: "popup_error_unsupportedUrl_title",
        descriptionKey: "popup_error_unsupportedUrl_description",
        cardClassName: "border-blue-500/30 border-s-blue-400 bg-blue-400/12",
        iconClassName: "text-sky-300",
        canRetry: false,
    },
    unknown: {
        icon: AlertTriangle,
        titleKey: "popup_error_unknown_title",
        descriptionKey: "popup_error_unknown_description",
        cardClassName: "border-red-500/30 border-s-red-400 bg-red-500/10",
        iconClassName: "text-red-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
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
            className={cn(
                "flex flex-col gap-2.5 rounded-lg border border-s-3 p-3 text-start",
                presentation.cardClassName,
            )}
        >
            <div className="flex items-start gap-2">
                <Icon
                    className={cn("mt-0.5 size-4 shrink-0", presentation.iconClassName)}
                    aria-hidden="true"
                />
                <div className="flex min-w-0 flex-col gap-1">
                    <div className="text-xs font-semibold text-neutral-100">
                        {t(presentation.titleKey)}
                    </div>
                    <p className="text-[11px] leading-relaxed text-zinc-300">
                        {t(presentation.descriptionKey)}
                    </p>
                </div>
            </div>
            {presentation.canRetry && (
                <button
                    type="button"
                    disabled={isRetrying}
                    onClick={onRetry}
                    className={cn(
                        "flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                        presentation.retryButtonClassName,
                    )}
                >
                    <RefreshCw
                        className={cn("size-3.5 shrink-0", isRetrying && "animate-spin")}
                        aria-hidden="true"
                    />
                    <span>{isRetrying ? t("common_retrying") : t("common_retry")}</span>
                </button>
            )}
        </div>
    );
}
