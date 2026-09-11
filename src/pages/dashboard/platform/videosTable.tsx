import type { PlatformId } from "@app-types/types";
import VideoTableRow from "./videoTableRow";
import type { VideoRowDetails } from "./videoTableRow";
export type { VideoRowDetails } from "./videoTableRow";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function VideosTable({
    rows,
    platform,
}: {
    rows: VideoRowDetails[];
    platform: PlatformId;
}) {
    const sorted = rows.toSorted((a, b) => b.usage - a.usage);

    return (
        <Table className="font-mono">
            <TableHeader className="uppercase">
                <TableRow>
                    <TableHead className="text-center">#</TableHead>
                    <TableHead>VIDEO</TableHead>
                    <TableHead>DATA USED</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {sorted.map((videoDetails, index) => {
                    return (
                        <VideoTableRow
                            key={`${videoDetails.date}-${videoDetails.videoTag}`}
                            videoDetails={videoDetails}
                            index={index + 1}
                            platform={platform}
                        />
                    );
                })}
            </TableBody>
        </Table>
    );
}
