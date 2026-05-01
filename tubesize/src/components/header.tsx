import type { KickData, TwitchData, YoutubeData } from "@app-types/types";
import { humanizeDuration } from "@lib/utils";

interface Props {
    pageType?: "youtube" | "twitch" | "kick" | "default";
    youtubeData?: YoutubeData | null;
    twitchData?: TwitchData | null;
    kickData?: KickData | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

function getYoutubeTitle(youtubeData?: YoutubeData | null): string {
    return youtubeData?.type === "video"
        ? youtubeData.title || "YouTube Video"
        : youtubeData?.channelName || "YouTube Live";
}

function getYoutubeDuration(youtubeData?: YoutubeData | null): string | undefined {
    return youtubeData?.type === "video"
        ? humanizeDuration(youtubeData?.durationSeconds * 1000)
        : undefined;
}

function getTwitchTitle(twitchData?: TwitchData | null): string {
    const data = twitchData;

    if (!data) {
        return "Twitch";
    }

    if (data.type === "live") {
        return data.channelName;
    }

    return "Twitch Video";
}

function getTwitchDuration(twitchData?: TwitchData | null): string | undefined {
    const data = twitchData;

    if (!data || data.type === "live") {
        return undefined;
    }

    if (data.type === "vod" && data.durationSeconds) {
        return humanizeDuration(data.durationSeconds * 1000);
    }

    return undefined;
}

export default function Header({
    pageType = "default",
    youtubeData,
    twitchData,
    kickData,
    setUseOptionsPage,
}: Props) {
    const isLive =
        (pageType === "youtube" && youtubeData?.type === "live") ||
        (pageType === "twitch" && twitchData?.type === "live") ||
        pageType === "kick";

    let title: string;
    let duration: string | undefined;

    switch (pageType) {
        case "youtube": {
            title = getYoutubeTitle(youtubeData);
            duration = getYoutubeDuration(youtubeData);
            break;
        }
        case "twitch": {
            title = getTwitchTitle(twitchData);
            duration = getTwitchDuration(twitchData);
            break;
        }
        case "kick": {
            title = kickData?.channelName || "Kick Stream";
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
