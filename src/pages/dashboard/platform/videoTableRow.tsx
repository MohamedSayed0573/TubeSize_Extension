import type { PlatformId } from "@app-types/types";
import { formatBytes } from "@lib/format";
import { buildPlatformVideoUrl, getPlatformDisplayName } from "@lib/platformUrl";
import { buildDatePath } from "@lib/routes";
import type { PlatformWatchRow } from "@lib/usage";
import { Link } from "react-router";

import { AspectRatio } from "@/components/ui/aspect-ratio";
import { TableCell, TableRow } from "@/components/ui/table";
import { t } from "@/i18n/t";

import { PLATFORM_THEME } from "./platformTheme";

export default function VideoTableRow({
    videoDetails,
    index,
    platform,
}: {
    videoDetails: PlatformWatchRow;
    index: number;
    platform: PlatformId;
}) {
    const {
        date,
        usage,
        channelName,
        channelUrl,
        mediaId,
        contentType,
        url: storedUrl,
    } = videoDetails;
    const url = storedUrl || buildPlatformVideoUrl(platform, mediaId, contentType, channelName);

    const imageUrl = videoDetails.thumbnailUrl || PLATFORM_THEME[platform].placeholderImage;
    const videoTitle = videoDetails.title || getPlatformDisplayName(platform);

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
                                e.currentTarget.src = PLATFORM_THEME[platform].placeholderImage;
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
                            to={buildDatePath(date)}
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
