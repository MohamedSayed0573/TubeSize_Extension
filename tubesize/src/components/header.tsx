import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";
import { humanizeDuration } from "@lib/utils";

interface Props {
    pageType?: "youtube" | "twitch" | "default";
    youtubeData?: YoutubeBackgroundResponse | null;
    twitchData?: TwitchBackgroundResponse | null;
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
    setUseOptionsPage,
}: Props) {
    const isLive =
        (pageType === "youtube" && youtubeData?.data?.isLive) ||
        (pageType === "twitch" && twitchData?.twitchData && "channelName" in twitchData.twitchData);

    let title = "TubeSize";
    let duration: string | undefined;

    if (pageType === "youtube") {
        title = getYoutubeTitle(youtubeData);
        duration = getYoutubeDuration(youtubeData);
    } else if (pageType === "twitch") {
        title = getTwitchTitle(twitchData);
        duration = getTwitchDuration(twitchData);
    }

    return (
        <div className="header">
            <div
                className="title"
                title={pageType === "youtube" ? youtubeData?.data?.title : title}
            >
                {title}
            </div>
            {isLive ? (
                <span className="live-indicator" id="duration-display">
                    Live
                </span>
            ) : duration ? (
                <span className="duration" id="duration-display">
                    {duration}
                </span>
            ) : null}
            <button id="optionsBtn" onClick={() => setUseOptionsPage(true)}>
                Options
            </button>
        </div>
    );
}
