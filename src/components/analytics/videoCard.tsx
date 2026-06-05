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

export default function VideoCard({
    videoDetails,
    index,
}: {
    videoDetails: VideoDetails;
    index: number;
}) {
    const { date, videoTag, usage } = videoDetails;
    const url = getVideoUrl(videoDetails.videoTag);

    const imageUrl =
        videoDetails.thumbnailUrl || "https://placehold.co/213x120?text=Unknown&font=roboto";

    const displayTitle = videoDetails.title || "Youtube";

    return (
        <tr key={`${date}-${videoTag}`}>
            <td className="index">{index}</td>

            <td>
                <a
                    className="flex items-center gap-5 text-sm font-medium text-white no-underline overflow-hidden"
                    target="_blank"
                    rel="noreferrer"
                    href={url}
                >
                    <img
                        className="h-17.5 rounded-lg aspect-video"
                        src={imageUrl}
                        alt="thumbnail"
                    />

                    <div className="flex flex-col gap-1 overflow-hidden min-w-0">
                        <span className="truncate">{displayTitle}</span>
                        {videoDetails.channelName && (
                            <span className="text-xs truncate">
                                <a
                                    className="text-[#8b8d93] no-underline hover:underline"
                                    href={"https://www.youtube.com/@" + videoDetails.channelName}
                                >
                                    {videoDetails.channelName}
                                </a>
                            </span>
                        )}
                        <span className="text-xs text-[#b4b8c2] font-normal truncate">
                            <Link
                                className="text-[#b4b8c2] no-underline hover:underline"
                                to={`/analytics/${date}`}
                            >
                                {date}
                            </Link>
                        </span>
                    </div>
                </a>
            </td>

            <td>{formatBytes(usage)}</td>
        </tr>
    );
}
