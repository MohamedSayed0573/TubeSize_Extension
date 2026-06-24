import type { PopupData } from "@app-types/uiTypes";
import type { KickData, TwitchData, YoutubeData } from "@app-types/types";
import { humanizeDuration } from "@lib/utils";
import { useNavigate } from "react-router";

function getYoutubeTitle(youtubeData?: YoutubeData | null): string {
    return youtubeData?.type === "video"
        ? youtubeData.title || "YouTube Video"
        : youtubeData?.channelName || "YouTube Live";
}

function getYoutubeDuration(youtubeData?: YoutubeData | null): string | undefined {
    return youtubeData?.type === "video"
        ? humanizeDuration(youtubeData.durationSeconds * 1000)
        : undefined;
}

function getTwitchTitle(twitchData?: TwitchData | null): string {
    if (!twitchData) {
        return "Twitch";
    }

    if (twitchData.type === "live") {
        return twitchData.channelName;
    }

    return "Twitch Video";
}

function getTwitchDuration(twitchData?: TwitchData | null): string | undefined {
    const data = twitchData;

    if (!data || data.type === "live") {
        return undefined;
    }

    if (data.durationSeconds) {
        return humanizeDuration(data.durationSeconds * 1000);
    }

    return undefined;
}

function getKickTitle(kickData?: KickData | null): string {
    return kickData?.channelName ?? "Kick";
}

function getKickDuration(kickData?: KickData | null): string | undefined {
    if (kickData?.type === "vod" && kickData.durationSeconds) {
        return humanizeDuration(kickData.durationSeconds * 1000);
    }

    return undefined;
}

interface Props {
    data?: PopupData;
}

export default function Header({ data }: Props) {
    const navigate = useNavigate();
    const isLive = data?.data.type === "live";
    let title: string;
    let duration: string | undefined;

    switch (data?.platform) {
        case "youtube": {
            title = getYoutubeTitle(data.data);
            duration = getYoutubeDuration(data.data);
            break;
        }
        case "twitch": {
            title = getTwitchTitle(data.data);
            duration = getTwitchDuration(data.data);
            break;
        }
        case "kick": {
            title = getKickTitle(data.data);
            duration = getKickDuration(data.data);
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
                {isLive && <span className="red-500 text-sm font-medium">Live</span>}
                {duration && (
                    <span className="shrink-0 text-xs font-medium text-zinc-400">{duration}</span>
                )}
            </div>
            <div className="flex items-center justify-between gap-2.5">
                <button
                    className="neutral-100 flex-1 cursor-pointer rounded-lg border border-white/8 bg-white/8 p-2 text-xs transition-colors hover:border-white/15 hover:bg-white/15"
                    onClick={() => void navigate("/options")}
                >
                    Options
                </button>
                <button
                    className="neutral-100 flex-1 cursor-pointer rounded-lg border border-white/8 bg-white/8 p-2 text-xs transition-colors hover:border-white/15 hover:bg-white/15"
                    onClick={navigateToAnalytics}
                >
                    Analytics
                </button>
            </div>
        </div>
    );
}

function navigateToAnalytics() {
    void chrome.tabs.create({
        active: true,
        url: chrome.runtime.getURL("index.html#/analytics"),
    });
}
