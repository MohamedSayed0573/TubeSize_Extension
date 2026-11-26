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
    iconClassName: string;
    canRetry: boolean;
    retryButtonClassName?: string;
};

const SECONDARY_RETRY_BUTTON =
    "border-white/15 bg-white/8 text-neutral-50 hover:border-white/25 hover:bg-white/15";

const PRIMARY_RETRY_BUTTON =
    "border-transparent bg-zinc-100 font-semibold text-zinc-950 hover:bg-white";

const ERROR_PRESENTATION: Record<MediaEstimateErrorCode, ErrorPresentation> = {
    stream_offline: {
        icon: Radio,
        titleKey: "popup_error_streamOffline_title",
        descriptionKey: "popup_error_streamOffline_description",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    restricted_content: {
        icon: Lock,
        titleKey: "popup_error_restrictedContent_title",
        descriptionKey: "popup_error_restrictedContent_description",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    unavailable: {
        icon: VideoOff,
        titleKey: "popup_error_unavailable_title",
        descriptionKey: "popup_error_unavailable_description",
        iconClassName: "text-zinc-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    network_error: {
        icon: WifiOff,
        titleKey: "popup_error_networkError_title",
        descriptionKey: "popup_error_networkError_description",
        iconClassName: "text-red-400",
        canRetry: true,
        retryButtonClassName: PRIMARY_RETRY_BUTTON,
    },
    no_formats: {
        icon: Film,
        titleKey: "popup_error_noFormats_title",
        descriptionKey: "popup_error_noFormats_description",
        iconClassName: "text-amber-400",
        canRetry: true,
        retryButtonClassName: SECONDARY_RETRY_BUTTON,
    },
    unsupported_url: {
        icon: Link2Off,
        titleKey: "popup_error_unsupportedUrl_title",
        descriptionKey: "popup_error_unsupportedUrl_description",
        iconClassName: "text-sky-300",
        canRetry: false,
    },
    unknown: {
        icon: AlertTriangle,
        titleKey: "popup_error_unknown_title",
        descriptionKey: "popup_error_unknown_description",
        iconClassName: "text-red-400",
        canRetry: true,
        retryButtonClassName: PRIMARY_RETRY_BUTTON,
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
                <Icon className={cn("size-3.5 shrink-0", presentation.iconClassName)} />
            </div>
            <div className="text-[12.5px] font-semibold text-neutral-50">
                {t(presentation.titleKey)}
            </div>
            <p className="max-w-[202px] text-[11px] leading-relaxed text-zinc-400">
                {t(presentation.descriptionKey)}
            </p>
            {presentation.canRetry && (
                <button
                    type="button"
                    disabled={isRetrying}
                    onClick={onRetry}
                    className={cn(
                        "mt-1.5 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/40 disabled:cursor-not-allowed disabled:opacity-65",
                        presentation.retryButtonClassName,
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
