import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";
import { humanizeDuration } from "@lib/utils";

interface Props {
    pageType?: "youtube" | "twitch" | "default";
    youtubeData?: YoutubeBackgroundResponse | null;
    twitchData?: TwitchBackgroundResponse | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

function getTitle(
    pageType: Props["pageType"],
    youtubeData?: YoutubeBackgroundResponse | null,
    twitchData?: TwitchBackgroundResponse | null,
): string {
    if (pageType === "youtube") {
        return youtubeData?.data?.title ?? "TubeSize";
    }
    if (pageType === "twitch") {
        const data = twitchData?.twitchData;
        if (!data) return "Twitch";
        return "channelName" in data ? (data.channelName ?? "Twitch") : "Twitch Video";
    }
    return "TubeSize";
}

function getDuration(
    pageType: Props["pageType"],
    youtubeData?: YoutubeBackgroundResponse | null,
    twitchData?: TwitchBackgroundResponse | null,
): string | undefined {
    if (pageType === "youtube") {
        return youtubeData?.data?.isLive ? "Live" : youtubeData?.data?.durationMinutes;
    }
    if (pageType === "twitch") {
        const data = twitchData?.twitchData;
        if (data && "durationSeconds" in data && data.durationSeconds) {
            return humanizeDuration(data.durationSeconds * 1000);
        } else if (data && "channelName" in data) {
            return "Live";
        } else {
            return undefined;
        }
    }
    return undefined;
}

export default function Header({
    pageType = "default",
    youtubeData,
    twitchData,
    setUseOptionsPage,
}: Props) {
    const title = getTitle(pageType, youtubeData, twitchData);
    const duration = getDuration(pageType, youtubeData, twitchData);

    return (
        <div className="header">
            <div
                className="title"
                title={pageType === "youtube" ? youtubeData?.data?.title : title}
            >
                {title}
            </div>
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
