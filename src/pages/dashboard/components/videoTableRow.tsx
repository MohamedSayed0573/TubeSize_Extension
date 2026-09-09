import { formatBytes } from "@lib/dashboardUtils";
import { getChannelUrl } from "@pages/dashboard/components/platformUtils";
import { Link } from "react-router";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import type { DateKey, PlatformId } from "@app-types/types";

import { TableCell, TableRow } from "@/components/ui/table";

const PLACEHOLDER_IMAGE = "/thumbnail-placeholder.svg";

const PLATFORM_PLACEHOLDER_IMAGE: Record<PlatformId, string> = {
    youtube: PLACEHOLDER_IMAGE,
    twitch: "/thumbnail-placeholder-twitch.svg",
    kick: PLACEHOLDER_IMAGE,
};

function getVideoUrl(platform: PlatformId, videoTag: string, contentType?: "live" | "vod") {
    switch (platform) {
        case "youtube": {
            return `https://youtube.com/watch?v=${videoTag}`;
        }
        case "twitch": {
            const isVod =
                contentType === undefined ? /^[0-9]+$/.test(videoTag) : contentType === "vod";
            return isVod
                ? `https://www.twitch.tv/videos/${videoTag}`
                : `https://www.twitch.tv/${videoTag}`;
        }
        case "kick": {
            return `https://kick.com/video/${videoTag}`;
        }
    }
}

export interface VideoRowDetails {
    videoTag: string;
    usage: number;
    title: string | undefined;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    contentType?: "live" | "vod";
    date: DateKey;
}

export default function VideoTableRow({
    videoDetails,
    index,
    platform,
}: {
    videoDetails: VideoRowDetails;
    index: number;
    platform: PlatformId;
}) {
    const { date, usage } = videoDetails;
    const url = getVideoUrl(platform, videoDetails.videoTag, videoDetails.contentType);
    const channelUrl = getChannelUrl(platform, videoDetails.channelName);

    const imageUrl = videoDetails.thumbnailUrl || PLATFORM_PLACEHOLDER_IMAGE[platform];
    const videoTitle = videoDetails.title || platform;

    return (
        <TableRow className="text-stone-200 hover:cursor-pointer hover:bg-neutral-800">
            <TableCell className="px-3 py-3 text-center">{index}</TableCell>

            <TableCell className="flex items-center gap-5 p-3">
                <AspectRatio ratio={16 / 9} className="w-30 shrink-0">
                    <a target="_blank" rel="noreferrer" href={url}>
                        <img
                            className="h-full w-full rounded-lg object-cover"
                            src={imageUrl}
                            alt="thumbnail"
                            onError={(e) => {
                                e.currentTarget.src = PLATFORM_PLACEHOLDER_IMAGE[platform];
                            }}
                        />
                    </a>
                </AspectRatio>

                <div className="flex flex-col gap-1">
                    <span className="truncate text-base">
                        <a href={url} target="_blank" rel="noreferrer" className="font-sans">
                            {videoTitle}
                        </a>
                    </span>
                    {videoDetails.channelName && (
                        <span className="truncate text-sm text-gray-500">
                            {channelUrl ? (
                                <a
                                    className="hover:underline"
                                    href={channelUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    {videoDetails.channelName}
                                </a>
                            ) : (
                                videoDetails.channelName
                            )}
                        </span>
                    )}
                    <span className="truncate text-sm font-normal">
                        <Link
                            className="text-gray-400 no-underline hover:underline"
                            to={`/dashboard/${date}`}
                        >
                            {date}
                        </Link>
                    </span>
                </div>
            </TableCell>

            <TableCell className="text-base">{formatBytes(usage)}</TableCell>
        </TableRow>
    );
}
