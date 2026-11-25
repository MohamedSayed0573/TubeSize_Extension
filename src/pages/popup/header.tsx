import type { MediaEstimate } from "@app-types/platforms.types";
import { chromeNavigate } from "@lib/browser";
import { formatEstimateHeader, type HeaderViewData } from "@lib/mediaEstimate";
import { POPUP_ROUTES } from "@lib/routes";
import { ExternalLink, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router";

import { t } from "@/i18n/t";

type Props = {
    estimate?: MediaEstimate;
};

export default function Header({ estimate }: Props) {
    const navigate = useNavigate();
    const isLive = estimate?.contentType === "live";
    const { title, duration }: HeaderViewData = estimate
        ? formatEstimateHeader(estimate)
        : { title: "TubeSize" };

    return (
        <div className="border-b-2 border-white/8 px-2.5 py-1.5">
            <div className="flex items-center justify-between gap-2.5 px-0.5 py-2">
                <div className="truncate text-sm font-semibold" title={title}>
                    {title}
                </div>
                {isLive && (
                    <div className="flex items-center gap-1">
                        <span className="size-2 animate-pulse rounded-full bg-red-600"></span>
                        <span className="animate-pulse text-sm font-bold text-red-500">
                            {t("popup_live")}
                        </span>
                    </div>
                )}
                {duration && (
                    <span className="shrink-0 text-xs font-medium text-zinc-400">{duration}</span>
                )}
            </div>
            <div className="flex items-center justify-between gap-2.5">
                <button
                    className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/8 p-2 text-xs text-neutral-100 transition-colors hover:border-white/15 hover:bg-white/15"
                    onClick={() => void navigate(POPUP_ROUTES.settings)}
                >
                    {t("popup_settings")}
                    <SettingsIcon className="size-3.5 opacity-70" aria-hidden="true" />
                </button>
                <button
                    className="flex flex-2 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/8 p-2 text-xs text-neutral-100 transition-colors hover:border-white/15 hover:bg-white/15"
                    onClick={() => chromeNavigate({ page: "dashboard" })}
                >
                    {t("popup_dashboard")}
                    <ExternalLink className="size-3.5 opacity-70" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
