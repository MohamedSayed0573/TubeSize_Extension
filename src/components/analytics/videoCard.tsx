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
                <a className="video-title-cell" target="_blank" rel="noreferrer" href={url}>
                    <img className="video-thumbnail" src={imageUrl} alt="thumbnail" />

                    <div className="video-info">
                        <span className="video-title">{displayTitle}</span>
                        {videoDetails.channelName && (
                            <span className="video-channel">
                                <a href={"https://www.youtube.com/@" + videoDetails.channelName}>
                                    {videoDetails.channelName}
                                </a>
                            </span>
                        )}
                        <span className="date-cell">
                            <Link to={`/analytics/${date}`}>{date}</Link>
                        </span>
                    </div>
                </a>
            </td>

            <td>{formatBytes(usage)}</td>
        </tr>
    );
}
