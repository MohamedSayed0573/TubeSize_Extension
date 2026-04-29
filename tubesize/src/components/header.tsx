import type {
    KickBackgroundResponse,
    TwitchBackgroundResponse,
    YoutubeBackgroundResponse,
} from "@app-types/types";
import { humanizeDuration } from "@lib/utils";

interface Props {
    pageType?: "youtube" | "twitch" | "kick" | "default";
    youtubeData?: YoutubeBackgroundResponse | null;
    twitchData?: TwitchBackgroundResponse | null;
    kickData?: KickBackgroundResponse | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

function getYoutubeTitle(youtubeData?: YoutubeBackgroundResponse | null): string {
    return youtubeData?.data?.title || "YouTube Video";
}

function getYoutubeDuration(youtubeData?: YoutubeBackgroundResponse | null): string | undefined {
    return youtubeData?.data?.durationMinutes;
}

function getTwitchTitle(twitchData?: TwitchBackgroundResponse | null): string {
    const data = twitchData?.twitchData;

    if (!data) {
        return "Twitch";
    }

    if (data.type === "live") {
        return data.channelName;
    }

    return "Twitch Video";
}

function getTwitchDuration(twitchData?: TwitchBackgroundResponse | null): string | undefined {
    const data = twitchData?.twitchData;

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
        (pageType === "youtube" && youtubeData?.data?.isLive) ||
        (pageType === "twitch" &&
            twitchData?.twitchData &&
            "channelName" in twitchData.twitchData) ||
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
            <div
                className="title"
                title={pageType === "youtube" ? youtubeData?.data?.title : title}
            >
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
