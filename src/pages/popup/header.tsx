import type { PopupData } from "@app-types/uiTypes";
import type { KickData, TwitchData, YoutubeData } from "@app-types/platforms.types";
import { chromeNavigate } from "@lib/utils";
import { humanizeDuration } from "@lib/humanize";
import { useNavigate } from "react-router";
import { ExternalLink, Settings as SettingsIcon } from "lucide-react";

function getYoutubeTitle(youtubeData: YoutubeData | null | undefined): string {
    return youtubeData?.type === "video"
        ? youtubeData.title || chrome.i18n.getMessage("popup_youtubeVideo")
        : youtubeData?.channelName || chrome.i18n.getMessage("popup_youtubeLive");
}

function getYoutubeDuration(youtubeData?: YoutubeData | null, language = "en"): string | undefined {
    return youtubeData?.type === "video"
        ? humanizeDuration(youtubeData.durationSeconds * 1000, language)
        : undefined;
}

function getTwitchTitle(twitchData: TwitchData | null | undefined): string {
    if (!twitchData) {
        return "Twitch";
    }

    if (twitchData.type === "live") {
        return twitchData.channelName;
    }

    return chrome.i18n.getMessage("popup_twitchVideo");
}

function getTwitchDuration(twitchData?: TwitchData | null, language = "en"): string | undefined {
    const data = twitchData;

    if (!data || data.type === "live") {
        return undefined;
    }

    if (data.durationSeconds) {
        return humanizeDuration(data.durationSeconds * 1000, language);
    }

    return undefined;
}

function getKickTitle(kickData?: KickData | null): string {
    return kickData?.channelName ?? "Kick";
}

function getKickDuration(kickData?: KickData | null, language = "en"): string | undefined {
    if (kickData?.type === "vod" && kickData.durationSeconds) {
        return humanizeDuration(kickData.durationSeconds * 1000, language);
    }

    return undefined;
}

interface Props {
    data?: PopupData;
}

export default function Header({ data }: Props) {
    const navigate = useNavigate();
    const language = chrome.i18n.getUILanguage();
    const isLive = data?.data.type === "live";
    let title: string;
    let duration: string | undefined;

    switch (data?.platform) {
        case "youtube": {
            title = getYoutubeTitle(data.data);
            duration = getYoutubeDuration(data.data, language);
            break;
        }
        case "twitch": {
            title = getTwitchTitle(data.data);
            duration = getTwitchDuration(data.data, language);
            break;
        }
        case "kick": {
            title = getKickTitle(data.data);
            duration = getKickDuration(data.data, language);
            break;
        }
        default: {
            title = "TubeSize";
        }
    }

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
                            {chrome.i18n.getMessage("popup_live")}
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
                    onClick={() => void navigate("/settings")}
                >
                    {chrome.i18n.getMessage("popup_settings")}
                    <SettingsIcon className="size-3.5 opacity-70" aria-hidden="true" />
                </button>
                <button
                    className="flex flex-2 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/8 bg-white/8 p-2 text-xs text-neutral-100 transition-colors hover:border-white/15 hover:bg-white/15"
                    onClick={() => chromeNavigate("dashboard")}
                >
                    {chrome.i18n.getMessage("popup_dashboard")}
                    <ExternalLink className="size-3.5 opacity-70" aria-hidden="true" />
                </button>
            </div>
        </div>
    );
}
