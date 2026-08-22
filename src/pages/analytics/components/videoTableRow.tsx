import { formatBytes } from "@lib/analyticsUtils";
import { Link } from "react-router";
import { AspectRatio } from "@/components/ui/aspect-ratio";

const PLACEHOLDER_IMAGE = "/thumbnail-placeholder.svg";

function getVideoUrl(videoTag: string) {
    return `https://youtube.com/watch?v=${videoTag}`;
}

type VideoDetails = {
    usage: number;
    title: string | undefined;
    thumbnailUrl: string | undefined;
    channelName: string | undefined;
    videoTag: string;
    date: string;
};

export default function VideoTableRow({
    videoDetails,
    index,
}: {
    videoDetails: VideoDetails;
    index: number;
}) {
    const { date, usage } = videoDetails;
    const url = getVideoUrl(videoDetails.videoTag);

    const imageUrl = videoDetails.thumbnailUrl || PLACEHOLDER_IMAGE;

    const videoTitle = videoDetails.title || "Youtube";

    return (
        <tr className="hover:cursor-pointer hover:bg-neutral-800">
            <td className="border-b border-neutral-800 px-3 py-3 text-center font-mono text-sm text-stone-200">
                {index}
            </td>

            <td className="flex items-center gap-5 border-b border-neutral-800 px-3 py-3 text-left font-mono text-sm text-stone-200">
                <a target="_blank" rel="noreferrer" href={url}>
                    <AspectRatio ratio={16 / 9} className="w-40 shrink-0">
                        <img
                            className="h-full w-full rounded-lg object-cover"
                            src={imageUrl}
                            alt="thumbnail"
                            onError={(e) => {
                                e.currentTarget.src = PLACEHOLDER_IMAGE;
                            }}
                        />
                    </AspectRatio>
                </a>

                <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
                    <span className="truncate text-base">
                        <a href={url} target="_blank" rel="noreferrer">
                            {videoTitle}
                        </a>
                    </span>
                    {videoDetails.channelName && (
                        <span className="truncate text-sm">
                            <a
                                className="text-gray-500 no-underline hover:underline"
                                href={"https://www.youtube.com/@" + videoDetails.channelName}
                            >
                                {videoDetails.channelName}
                            </a>
                        </span>
                    )}
                    <span className="truncate text-sm font-normal text-gray-400">
                        <Link
                            className="text-gray-400 no-underline hover:underline"
                            to={`/analytics/${date}`}
                        >
                            {date}
                        </Link>
                    </span>
                </div>
            </td>

            <td className="border-b border-neutral-800 px-3 py-3 text-left font-mono text-base text-stone-200">
                {formatBytes(usage)}
            </td>
        </tr>
    );
}
