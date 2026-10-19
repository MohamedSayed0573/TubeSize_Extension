import { t } from "@/i18n/t";
import { formatBytes } from "@lib/format";
import { Link } from "react-router";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { getPlatformAdapter } from "@/adapters/registry";
import type { DateKey, PlatformId } from "@app-types/types";
import type { VideoContentType } from "@/adapters/types";

import { TableCell, TableRow } from "@/components/ui/table";

const PLACEHOLDER_IMAGE = "/thumbnail-placeholder.svg";

const PLATFORM_PLACEHOLDER_IMAGE: Record<PlatformId, string> = {
    youtube: PLACEHOLDER_IMAGE,
    twitch: "/thumbnail-placeholder-twitch.svg",
    kick: PLACEHOLDER_IMAGE,
};

export interface VideoRowDetails {
    videoTag: string;
    usage: number;
    title: string | undefined;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    channelUrl: string | undefined;
    contentType?: VideoContentType;
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
    const { date, usage, channelUrl, videoTag, contentType } = videoDetails;
    const url = getPlatformAdapter(platform).videoUrl(videoTag, contentType);

    const imageUrl = videoDetails.thumbnailUrl || PLATFORM_PLACEHOLDER_IMAGE[platform];
    const videoTitle = videoDetails.title || platform;

    return (
        <TableRow className="text-stone-200 hover:cursor-pointer hover:bg-neutral-800">
            <TableCell className="p-3 text-center text-neutral-500">{index}</TableCell>

            <TableCell className="flex items-center gap-5 p-3">
                <AspectRatio ratio={16 / 9} className="w-32">
                    <a target="_blank" rel="noreferrer" href={url}>
                        <img
                            className="h-full w-full rounded-lg object-cover"
                            src={imageUrl}
                            alt={t("common_video")}
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
                            to={`/${date}`}
                        >
                            {date}
                        </Link>
                    </span>
                </div>
            </TableCell>

            <TableCell className="text-center text-base">{formatBytes(usage)}</TableCell>
        </TableRow>
    );
}
