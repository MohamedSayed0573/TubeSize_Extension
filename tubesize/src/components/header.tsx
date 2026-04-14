import type { TwitchBackgroundResponse, YoutubeBackgroundResponse } from "@app-types/types";

interface Props {
    pageType?: "youtube" | "twitch" | "default";
    youtubeData?: YoutubeBackgroundResponse | null;
    twitchData?: TwitchBackgroundResponse | null;
    setUseOptionsPage: (useOptionsPage: boolean) => void;
}

export default function Header({
    pageType = "default",
    youtubeData,
    twitchData,
    setUseOptionsPage,
}: Props) {
    const title =
        pageType === "youtube"
            ? (youtubeData?.data?.title ?? "TubeSize")
            : pageType === "twitch"
              ? twitchData?.twitchData?.channelName || "Twitch Stream"
              : "TubeSize";

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
