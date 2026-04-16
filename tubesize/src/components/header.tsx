import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";

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

export default function Header({
    pageType = "default",
    youtubeData,
    twitchData,
    setUseOptionsPage,
}: Props) {
    const title = getTitle(pageType, youtubeData, twitchData);

    const duration =
        pageType === "youtube" && !youtubeData?.data?.isLive
            ? youtubeData?.data?.durationMinutes
            : undefined;

    return (
        <div className="header">
            <div
                className="title"
                title={pageType === "youtube" ? youtubeData?.data?.title : title}
            >
                {title}
            </div>
            {pageType === "youtube" && (
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
