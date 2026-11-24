import type { PlatformId } from "@app-types/types";
import type { PlatformWatchRow } from "@lib/usage";

import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { t } from "@/i18n/t";

import VideoTableRow from "./videoTableRow";

export default function VideosTable({
    rows,
    platform,
}: {
    rows: PlatformWatchRow[];
    platform: PlatformId;
}) {
    return (
        <Table className="font-mono">
            <TableHeader className="uppercase">
                <TableRow>
                    <TableHead className="text-center">#</TableHead>
                    <TableHead className="ps-4">{t("common_video")}</TableHead>
                    <TableHead>{t("common_dataUsed")}</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {rows.map((videoDetails, index) => {
                    return (
                        <VideoTableRow
                            key={`${videoDetails.date}-${videoDetails.mediaId}`}
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
