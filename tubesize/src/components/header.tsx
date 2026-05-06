import type { PopupData } from "@/types/uiTypes";
import type { KickData, TwitchData, YoutubeData } from "@app-types/types";
import { humanizeDuration } from "@lib/utils";

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
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

export default function Header({ data, setUseOptionsPage }: Props) {
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
        <div className="header">
            <div className="title" title={title}>
                {title}
            </div>
            {isLive && <span className="live-indicator">Live</span>}
            {duration && (
                <span className="duration" id="duration-display">
                    {duration}
                </span>
            )}
            <button id="optionsBtn" onClick={() => setUseOptionsPage(true)}>
                Options
            </button>
        </div>
    );
}
