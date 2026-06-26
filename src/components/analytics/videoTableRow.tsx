import { formatBytes } from "@/lib/analyticsUtils";
import { Link } from "react-router";

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

    const imageUrl =
        videoDetails.thumbnailUrl || "https://placehold.co/213x120?text=Unknown&font=roboto";

    const displayTitle = videoDetails.title || "Youtube";

    return (
        <tr className="hover:cursor-pointer hover:bg-neutral-800">
            <td className="border-b border-neutral-800 px-3 py-3 text-center font-mono text-sm text-stone-200">
                {index}
            </td>

            <td className="flex items-center gap-5 border-b border-neutral-800 px-3 py-3 text-left font-mono text-sm text-stone-200">
                <a
                    className="flex items-center gap-5 overflow-hidden text-sm font-medium text-white no-underline"
                    target="_blank"
                    rel="noreferrer"
                    href={url}
                >
                    <img
                        className="aspect-video h-17.5 rounded-lg"
                        src={imageUrl}
                        alt="thumbnail"
                    />
                </a>

                <div className="flex min-w-0 flex-col gap-1 overflow-hidden">
                    <span className="truncate">
                        <a href={url} target="_blank" rel="noreferrer">
                            {displayTitle}
                        </a>
                    </span>
                    {videoDetails.channelName && (
                        <span className="truncate text-xs">
                            <a
                                className="text-gray-500 no-underline hover:underline"
                                href={"https://www.youtube.com/@" + videoDetails.channelName}
                            >
                                {videoDetails.channelName}
                            </a>
                        </span>
                    )}
                    <span className="truncate text-xs font-normal text-gray-400">
                        <Link
                            className="text-gray-400 no-underline hover:underline"
                            to={`/analytics/${date}`}
                        >
                            {date}
                        </Link>
                    </span>
                </div>
            </td>

            <td className="border-b border-neutral-800 px-3 py-3 text-left font-mono text-sm text-stone-200">
                {formatBytes(usage)}
            </td>
        </tr>
    );
}
